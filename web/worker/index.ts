// The worker: claims one job at a time, runs it, records the result. Start with `npm run worker`.
// One job at a time keeps the machine responsive; set IZWI_WORKER_CONCURRENCY later for a server.
import os from "node:os";
import { loadLocalEnv } from "../src/server/env";

loadLocalEnv();

async function main() {
  const { claim, heartbeat, succeed, failJob, block, sweep, isCancelled } = await import("../src/server/jobs");
  const { handle, Blocked, onFailed } = await import("../src/server/pipeline");
  const { toolVersions } = await import("../src/server/media");
  const { parse, run, now, one } = await import("../src/server/db");
  const { appliedVersion, SCHEMA_VERSION } = await import("../src/server/migrations");

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
    const started = Date.now();
    console.log(`→ ${job.type} ${job.id}`);
    try {
      const out = await handle({ job, input: parse(job.input, {}), beat, signal: ctrl.signal });
      if (!isCancelled(job.id)) succeed(job.id, out);
      console.log(`✓ ${job.type} ${job.id} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    } catch (e) {
      const msg = (e as Error).message || "Unknown error";
      if (isCancelled(job.id)) console.log(`× ${job.type} cancelled`);
      else if (stopping) failJob(job.id, "The worker stopped during this step. It will run again.", true);
      else if (e instanceof Blocked) {
        block(job.id, msg);
        console.log(`‖ ${job.type} blocked: ${msg}`);
      } else {
        failJob(job.id, msg, (e as { retryable?: boolean }).retryable === true);
        const after = one<{ status: string }>(`SELECT status FROM job WHERE id = ?`, job.id);
        if (after?.status === "failed") onFailed(job, msg);
        console.log(`✗ ${job.type} ${job.id}: ${msg}`);
      }
    } finally {
      clearInterval(keepAlive);
      current = null;
    }
  }
  clearInterval(beatTimer);
  run(`DELETE FROM worker_beat WHERE worker_id = ?`, workerId);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
