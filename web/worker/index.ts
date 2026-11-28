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

  if (await appliedVersion() < SCHEMA_VERSION) {
    console.error("The database needs migrating. Run: npm run db:migrate");
    process.exit(1);
  }
  const workerId = `worker-${os.hostname()}-${process.pid}`;
  const LEASE = 60_000;
  const versions = await toolVersions();
  let current: { id: string; ctrl: AbortController } | null = null;
  let stopping = false;

  let beatRunning = false;
  const beatWorker = async () => {
    if (beatRunning) return;
    beatRunning = true;
    try { await run(
      `INSERT INTO worker_beat (worker_id, info, seen_at) VALUES (?, ?, ?) ON CONFLICT(worker_id) DO UPDATE SET info = excluded.info, seen_at = excluded.seen_at`,
      workerId, JSON.stringify({ pid: process.pid, host: os.hostname(), tools: versions, job: current?.id ?? null, cpus: os.cpus().length, memGb: Math.round(os.totalmem() / 1e9) }), now(),
    ); } catch (e) { console.error("worker heartbeat failed", e instanceof Error ? e.name : "unknown"); }
    finally { beatRunning = false; }
  };
  void beatWorker();
  const beatTimer = setInterval(() => { void beatWorker(); }, 5000);
  try { await purgeOldAssistantMessages(); } catch (e) { console.error("assistant retention purge failed", e instanceof Error ? e.name : "unknown"); }
  let purgeRunning = false;
  const retentionTimer = setInterval(async () => {
    if (purgeRunning) return;
    purgeRunning = true;
    try { await purgeOldAssistantMessages(); } catch (e) { console.error("assistant retention purge failed", e instanceof Error ? e.name : "unknown"); }
    finally { purgeRunning = false; }
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

  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const step = async () => {
    await sweep();
    const job = await claim(workerId, LEASE);
    if (!job) {
      await pause(1000);
      return;
    }
    const usesWhisper = job.type === "transcribe" || (job.type as string) === "voice_transcribe";
    if (usesWhisper && !(await acquireWhisperLease(job.id))) {
      await deferWhisperJob(job.id, workerId);
      return;
    }
    const ctrl = new AbortController();
    current = { id: job.id, ctrl };
    let last = 0;
    const beat = async (p?: number, stage?: string) => {
      const t = Date.now();
      if (p !== undefined && t - last < 600) return;
      last = t;
      // Steps report progress without waiting, so a failed write here must not become an unhandled rejection.
      try {
        await heartbeat(job.id, workerId, LEASE, p, stage);
        if (await isCancelled(job.id)) ctrl.abort();
      } catch (e) { console.error("job heartbeat failed", e instanceof Error ? e.name : "unknown"); }
    };
    let keepAliveRunning = false;
    const keepAlive = setInterval(async () => {
      if (keepAliveRunning) return;
      keepAliveRunning = true;
      try { await beat(); }
      finally { keepAliveRunning = false; }
    }, 10_000);
    let whisperRenewRunning = false;
    const whisperKeepAlive = usesWhisper ? setInterval(async () => {
      if (whisperRenewRunning) return;
      whisperRenewRunning = true;
      try { if (!(await renewWhisperLease(job.id))) ctrl.abort(); } catch { ctrl.abort(); }
      finally { whisperRenewRunning = false; }
    }, 30_000) : null;
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
          lineIds: Array.isArray(input.lineIds) ? input.lineIds.filter((x): x is string => typeof x === "string") : undefined,
          createdBy: job.created_by,
        })
        : await handle({ job, input, beat, signal: ctrl.signal });
      await succeed(job.id, workerId, out);
      console.log(`✓ ${job.type} ${job.id} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    } catch (e) {
      const msg = (e as Error).message || "Unknown error";
      if (await isCancelled(job.id)) console.log(`× ${job.type} cancelled`);
      else if (stopping) await failJob(job.id, workerId, "The worker stopped during this step. It will run again.", true);
      else if (e instanceof Blocked) {
        await block(job.id, workerId, msg);
        console.log(`‖ ${job.type} blocked: ${msg}`);
      } else {
        const applied = await failJob(job.id, workerId, msg, (e as { retryable?: boolean }).retryable === true);
        if (applied && (await one<{ status: string }>(`SELECT status FROM job WHERE id = ?`, job.id))?.status === "failed") {
          await onFailed(job, msg);
        }
        console.log(`✗ ${job.type} ${job.id}: ${msg}`);
      }
    } finally {
      clearInterval(keepAlive);
      if (whisperKeepAlive) clearInterval(whisperKeepAlive);
      if (usesWhisper) await releaseWhisperLease(job.id);
      current = null;
    }
  };
  // A database hiccup pauses the worker instead of ending it. A job it was holding returns to the queue when its lease expires.
  while (!stopping) {
    try { await step(); }
    catch (e) {
      console.error("worker: could not reach the queue, trying again in 3 s", e instanceof Error ? e.name : "unknown");
      await pause(3000);
    }
  }
  clearInterval(beatTimer);
  clearInterval(retentionTimer);
  await run(`DELETE FROM worker_beat WHERE worker_id = ?`, workerId);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
