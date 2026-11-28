// Durable job queue in the database. The database is the record; no separate broker to drift out of sync.
// Claiming is one atomic UPDATE ... RETURNING. Leases expire, so a crashed worker's job is picked up again.
// Idempotency keys make "run this again" safe: the same key returns the existing job instead of a duplicate.
import { all, lockKey, newId, now, one, parse, run, tx } from "./db";
import { gateFor, gateReason } from "./rights";

export type JobType = "probe" | "proxy" | "transcribe" | "voice_transcribe" | "suggest_clips" | "translate" | "publish" | "render" | "package";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "blocked";
export type JobRow = {
  id: string; workspace_id: string; project_id: string | null; type: JobType; status: JobStatus;
  input: string; output: string | null; error: string | null; progress: number; stage: string | null;
  attempts: number; max_attempts: number; idempotency_key: string | null; depends_on: string | null;
  run_after: number; lease_until: number | null; worker_id: string | null; created_by: string | null;
  created_at: number; started_at: number | null; finished_at: number | null;
  priority: number;
};

export async function enqueue(j: {
  workspaceId: string; projectId: string | null; type: JobType; input?: unknown;
  idempotencyKey?: string; dependsOn?: string | null; createdBy?: string | null; maxAttempts?: number; priority?: number;
}): Promise<JobRow> {
  // Keys are scoped to the workspace: the same key in two workspaces names two different jobs.
  const key = j.idempotencyKey ? `${j.workspaceId}:${j.idempotencyKey}` : null;
  return tx(async () => {
    if (key) await lockKey(`job:${j.workspaceId}:${key}`);
    if (key) {
      const existing = await one<JobRow>(`SELECT * FROM job WHERE idempotency_key = ? AND workspace_id = ?`, key, j.workspaceId);
      if (existing && existing.status !== "failed" && existing.status !== "cancelled") return existing;
      if (existing) await run(`UPDATE job SET idempotency_key = NULL WHERE id = ?`, existing.id); // allow a fresh retry
    }
    const id = newId("job");
    await run(
      `INSERT INTO job (id, workspace_id, project_id, type, status, input, idempotency_key, depends_on, run_after, created_by, created_at, max_attempts, priority)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, j.workspaceId, j.projectId, j.type, JSON.stringify(j.input ?? {}), key,
      j.dependsOn ?? null, now(), j.createdBy ?? null, now(), j.maxAttempts ?? 3, j.priority ?? 0,
    );
    return (await one<JobRow>(`SELECT * FROM job WHERE id = ?`, id))!;
  });
}

export async function enqueueVoice(j: { id?: string; workspaceId: string; projectId: string; input: unknown; createdBy: string; idempotencyKey: string }): Promise<JobRow | null> {
  return tx(async () => {
    // The caller names the job when it has already stored the recording under that id.
    const id = j.id ?? newId("job");
    const row = await one<JobRow>(`INSERT INTO job (id, workspace_id, project_id, type, status, input, idempotency_key, run_after, created_by, created_at, max_attempts, priority) VALUES (?, ?, ?, 'voice_transcribe', 'queued', ?, ?, ?, ?, ?, 3, 10) ON CONFLICT DO NOTHING RETURNING *`, id, j.workspaceId, j.projectId, JSON.stringify(j.input), `${j.workspaceId}:${j.idempotencyKey}`, now(), j.createdBy, now());
    if (row) return row;
    const existing = await one<JobRow>(`SELECT * FROM job WHERE idempotency_key = ? AND workspace_id = ?`, `${j.workspaceId}:${j.idempotencyKey}`, j.workspaceId);
    if (existing) return existing;
    return null;
  });
}

export async function claim(workerId: string, leaseMs: number): Promise<JobRow | undefined> {
  const t = now();
  return one<JobRow>(
    `UPDATE job SET status = 'running', worker_id = ?, lease_until = ?, attempts = attempts + 1, started_at = COALESCE(started_at, ?), error = NULL
     WHERE id = (
       SELECT j.id FROM job j
       WHERE j.status = 'queued' AND j.run_after <= ?
         AND (j.depends_on IS NULL OR EXISTS (SELECT 1 FROM job d WHERE d.id = j.depends_on AND d.status = 'succeeded'))
       ORDER BY j.priority DESC, j.created_at FOR UPDATE SKIP LOCKED LIMIT 1
     )
     RETURNING *`,
    workerId, t + leaseMs, t, t,
  );
}

export async function heartbeat(id: string, workerId: string, leaseMs: number, progress?: number, stage?: string) {
  await run(
    `UPDATE job SET lease_until = ?, progress = COALESCE(?, progress), stage = COALESCE(?, stage) WHERE id = ? AND worker_id = ? AND status = 'running'`,
    now() + leaseMs, progress ?? null, stage ?? null, id, workerId,
  );
}

// Only the worker that holds the lease may finish a job, and only while it is still running. A job cancelled meanwhile,
// or one whose lease expired and was claimed by another worker, is left alone. Each returns whether it applied.
export async function succeed(id: string, workerId: string, output: unknown) {
  return (await run(
    `UPDATE job SET status = 'succeeded', output = ?, progress = 1, stage = 'done', lease_until = NULL, finished_at = ? WHERE id = ? AND worker_id = ? AND status = 'running'`,
    JSON.stringify(output ?? {}), now(), id, workerId,
  )).changes > 0;
}

export function failJob(id: string, workerId: string, message: string, retryable: boolean) {
  return tx(async () => {
    const j = await one<JobRow>(`SELECT * FROM job WHERE id = ? AND worker_id = ? AND status = 'running'`, id, workerId);
    if (!j) return false;
    if (retryable && j.attempts < j.max_attempts) {
      const backoff = 5000 * 2 ** (j.attempts - 1);
      await run(`UPDATE job SET status = 'queued', error = ?, run_after = ?, lease_until = NULL, worker_id = NULL WHERE id = ?`, message, now() + backoff, id);
    } else {
      await run(`UPDATE job SET status = 'failed', error = ?, lease_until = NULL, finished_at = ? WHERE id = ?`, message, now(), id);
    }
    return true;
  });
}

export async function block(id: string, workerId: string, reason: string) {
  return (await run(`UPDATE job SET status = 'blocked', error = ?, lease_until = NULL, worker_id = NULL WHERE id = ? AND worker_id = ? AND status = 'running'`, reason, id, workerId)).changes > 0;
}

export async function cancel(id: string, workspaceId: string) {
  return (await run(`UPDATE job SET status = 'cancelled', finished_at = ? WHERE id = ? AND workspace_id = ? AND status IN ('queued','blocked','running')`, now(), id, workspaceId)).changes > 0;
}

export async function cancelQueued(id: string, workspaceId: string) {
  return (await run(`UPDATE job SET status = 'cancelled', finished_at = ? WHERE id = ? AND workspace_id = ? AND status = 'queued'`, now(), id, workspaceId)).changes > 0;
}

export async function cancelQueuedOrBlocked(id: string, workspaceId: string) {
  return (await run(`UPDATE job SET status = 'cancelled', finished_at = ? WHERE id = ? AND workspace_id = ? AND status IN ('queued','blocked')`, now(), id, workspaceId)).changes > 0;
}

export async function acquireWhisperLease(jobId: string, leaseMs = 300_000) {
  const t = now();
  return Boolean(await one(`INSERT INTO whisper_lease (id, job_id, expires_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET job_id = excluded.job_id, expires_at = excluded.expires_at WHERE whisper_lease.expires_at <= ? RETURNING job_id`, jobId, t + leaseMs, t));
}

export async function renewWhisperLease(jobId: string, leaseMs = 300_000) {
  return (await run(`UPDATE whisper_lease SET expires_at = ? WHERE id = 1 AND job_id = ? AND expires_at > ?`, now() + leaseMs, jobId, now())).changes > 0;
}

export async function releaseWhisperLease(jobId: string) {
  return (await run(`DELETE FROM whisper_lease WHERE id = 1 AND job_id = ?`, jobId)).changes > 0;
}

export async function deferWhisperJob(id: string, workerId: string, delayMs = 2000) {
  return (await run(`UPDATE job SET status = 'queued', attempts = GREATEST(0, attempts - 1), run_after = ?, lease_until = NULL, worker_id = NULL WHERE id = ? AND worker_id = ? AND status = 'running'`, now() + delayMs, id, workerId)).changes > 0;
}

async function queueRenderOutput(job: JobRow): Promise<boolean> {
  const outputId = parse<{ outputId?: string }>(job.input, {}).outputId;
  if (!outputId) return false;
  const output = await one<{ id: string; project_id: string; start_ms: number; end_ms: number }>(
    `SELECT o.id, o.project_id, c.start_ms, c.end_ms FROM output o JOIN clip c ON c.id = o.clip_id WHERE o.id = ? AND o.job_id = ? AND o.workspace_id = ? AND o.status IN ('queued','failed','blocked')`, outputId, job.id, job.workspace_id,
  );
  if (!output || !(await gateFor(output.project_id, output.start_ms, output.end_ms)).ok) return false;
  await run(`UPDATE output SET status = 'queued', note = NULL, updated_at = ? WHERE id = ?`, now(), output.id);
  return true;
}

export function retry(id: string, workspaceId: string) {
  return tx(async () => {
    const job = await one<JobRow>(`SELECT * FROM job WHERE id = ? AND workspace_id = ? AND status IN ('failed','cancelled','blocked')`, id, workspaceId);
    if (!job || (job.type === "render" && !(await queueRenderOutput(job)))) return false;
    return (await run(`UPDATE job SET status = 'queued', run_after = ?, max_attempts = attempts + 3, error = NULL, progress = 0, stage = NULL, finished_at = NULL, worker_id = NULL, lease_until = NULL WHERE id = ?`, now(), id)).changes > 0;
  });
}

export async function isCancelled(id: string) {
  return (await one<{ status: string }>(`SELECT status FROM job WHERE id = ?`, id))?.status === "cancelled";
}

// Housekeeping each worker tick: expired leases go back to the queue; dependents of failed jobs fail with a reason.
export async function sweep() {
  const t = now();
  await run(`UPDATE job SET status = 'queued', worker_id = NULL, lease_until = NULL WHERE status = 'running' AND lease_until < ?`, t);
  await run(
    `UPDATE job SET status = 'failed', error = 'A step it depends on did not finish.', finished_at = ?
     WHERE status = 'queued' AND depends_on IN (SELECT id FROM job WHERE status IN ('failed','cancelled'))`,
    t,
  );
}

// The one way a held render goes back to work: its gate has to pass now, and the output and its job move together.
// A render held before it ran has a blocked job. A finished render held by a withdrawal has a succeeded job, and
// renders again so the new signed record names the current consent. A render the creator cancelled stays cancelled.
export function releaseHeldRenders(projectId: string) {
  return tx(async () => {
    const held = await all<{ id: string; job_id: string | null; start_ms: number; end_ms: number }>(
      `SELECT o.id, o.job_id, c.start_ms, c.end_ms FROM output o JOIN clip c ON c.id = o.clip_id AND c.project_id = o.project_id WHERE o.project_id = ? AND o.status = 'blocked'`, projectId,
    );
    let count = 0;
    for (const o of held) {
      const gate = await gateFor(projectId, o.start_ms, o.end_ms);
      if (!gate.ok) {
        // Still held: replace an out-of-date waiting reason. A withdrawal note is left as it is.
        const reason = gateReason(gate);
        await run(`UPDATE output SET note = ?, updated_at = ? WHERE id = ? AND status = 'blocked' AND (note LIKE 'Record your creator declaration%' OR note LIKE 'Waiting on %')`, reason, now(), o.id);
        if (o.job_id) await run(`UPDATE job SET error = ? WHERE id = ? AND status = 'blocked' AND (error LIKE 'Record your creator declaration%' OR error LIKE 'Waiting on %')`, reason, o.job_id);
        continue;
      }
      await run(`UPDATE output SET status = 'queued', note = NULL, updated_at = ? WHERE id = ? AND status = 'blocked'`, now(), o.id);
      if (o.job_id) {
        await run(
          `UPDATE job SET status = 'queued', error = NULL, progress = 0, stage = NULL, run_after = ?, max_attempts = attempts + 3, finished_at = NULL, worker_id = NULL, lease_until = NULL
           WHERE id = ? AND project_id = ? AND type = 'render' AND status IN ('blocked','succeeded','failed')`, now(), o.job_id, projectId,
        );
      }
      count++;
    }
    return count;
  });
}

export async function projectJobs(projectId: string, limit = 40) {
  return (await all<JobRow>(`SELECT * FROM job WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`, projectId, limit)).map(publicJob);
}

export function publicJob(j: JobRow) {
  return {
    id: j.id, type: j.type, status: j.status, progress: j.progress, stage: j.stage, error: j.error,
    attempts: j.attempts, input: parse<Record<string, unknown>>(j.input, {}), output: parse<Record<string, unknown> | null>(j.output, null),
    createdAt: j.created_at, startedAt: j.started_at, finishedAt: j.finished_at,
  };
}
