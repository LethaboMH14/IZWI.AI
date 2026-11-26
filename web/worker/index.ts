// The worker: claims one job at a time, runs it, records the result. Start with `npm run worker`.
// One job at a time keeps the machine responsive; set IZWI_WORKER_CONCURRENCY later for a server.
import os from "node:os";
import { loadLocalEnv } from "../src/server/env";

loadLocalEnv();

async function main() {
  const { claim, heartbeat, succeed, failJob, block, sweep, isCancelled, acquireWhisperLease, renewWhisperLease, releaseWhisperLease, deferWhisperJob } = await import("../src/server/jobs");
  const { handle, Blocked, onFailed } = await import("../src/server/pipeline");
  const { toolVersions } = await import("../src/server/media");
  const { parse, run, now, one } = await import("../src/server/db");
  const { scanProjectBatch } = await import("../src/server/injection");
  const { appliedVersion, SCHEMA_VERSION } = await import("../src/server/migrations");
  const { purgeOldAssistantMessages } = await import("../src/server/assistant-store");

  if (appliedVersion() < SCHEMA_VERSION) {
    console.error("The database needs migrating. Run: npm run db:migrate");
    process.exit(1);
  }
  const workerId = `worker-${os.hostname()}-${process.pid}`;
  const LEASE = 60_000;
  const versions = await toolVersions();
  let current: { id: string; ctrl: AbortController } | null = null;
  let stopping = false;

  const beatWorker = () =>
    run(
      `INSERT INTO worker_beat (worker_id, info, seen_at) VALUES (?, ?, ?) ON CONFLICT(worker_id) DO UPDATE SET info = excluded.info, seen_at = excluded.seen_at`,
      workerId, JSON.stringify({ pid: process.pid, host: os.hostname(), tools: versions, job: current?.id ?? null, cpus: os.cpus().length, memGb: Math.round(os.totalmem() / 1e9) }), now(),
    );
  beatWorker();
  const beatTimer = setInterval(beatWorker, 5000);
  try { purgeOldAssistantMessages(); } catch (e) { console.error("assistant retention purge failed", e instanceof Error ? e.name : "unknown"); }
  const retentionTimer = setInterval(() => {
    try { purgeOldAssistantMessages(); } catch (e) { console.error("assistant retention purge failed", e instanceof Error ? e.name : "unknown"); }
  }, 60 * 60_000);

  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log("worker stopping…");
    current?.ctrl.abort();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(`worker ${workerId} ready · ffmpeg ${versions.ffmpeg ?? "missing"} · whisper ${versions.whisper ?? "missing"}`);

  while (!stopping) {
    sweep();
    const job = claim(workerId, LEASE);
    if (!job) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    const usesWhisper = job.type === "transcribe" || (job.type as string) === "voice_transcribe";
    if (usesWhisper && !acquireWhisperLease(job.id)) {
      deferWhisperJob(job.id, workerId);
      continue;
    }
    const ctrl = new AbortController();
    current = { id: job.id, ctrl };
    let last = 0;
    const beat = (p?: number, stage?: string) => {
      const t = Date.now();
      if (p !== undefined && t - last < 600) return;
      last = t;
      heartbeat(job.id, workerId, LEASE, p, stage);
      if (isCancelled(job.id)) ctrl.abort();
    };
    const keepAlive = setInterval(() => beat(), 10_000);
    const whisperKeepAlive = usesWhisper ? setInterval(() => { if (!renewWhisperLease(job.id)) ctrl.abort(); }, 30_000) : null;
    const started = Date.now();
    console.log(`→ ${job.type} ${job.id}`);
    try {
      const input = parse<Record<string, unknown>>(job.input, {});
      const out = (job.type as string) === "injection_scan"
        ? await scanProjectBatch({
          workspaceId: job.workspace_id,
          projectId: job.project_id ?? "",
          trackId: typeof input.trackId === "string" ? input.trackId : "",
          afterIdx: typeof input.afterIdx === "number" ? input.afterIdx : -1,
          createdBy: job.created_by,
        })
        : await handle({ job, input, beat, signal: ctrl.signal });
      succeed(job.id, workerId, out);
      console.log(`✓ ${job.type} ${job.id} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    } catch (e) {
      const msg = (e as Error).message || "Unknown error";
      if (isCancelled(job.id)) console.log(`× ${job.type} cancelled`);
      else if (stopping) failJob(job.id, workerId, "The worker stopped during this step. It will run again.", true);
      else if (e instanceof Blocked) {
        block(job.id, workerId, msg);
        console.log(`‖ ${job.type} blocked: ${msg}`);
      } else {
        const applied = failJob(job.id, workerId, msg, (e as { retryable?: boolean }).retryable === true);
        if (applied && one<{ status: string }>(`SELECT status FROM job WHERE id = ?`, job.id)?.status === "failed") {
          onFailed(job, msg);
        }
        console.log(`✗ ${job.type} ${job.id}: ${msg}`);
      }
    } finally {
      clearInterval(keepAlive);
      if (whisperKeepAlive) clearInterval(whisperKeepAlive);
      if (usesWhisper) releaseWhisperLease(job.id);
      current = null;
    }
  }
  clearInterval(beatTimer);
  clearInterval(retentionTimer);
  run(`DELETE FROM worker_beat WHERE worker_id = ?`, workerId);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
