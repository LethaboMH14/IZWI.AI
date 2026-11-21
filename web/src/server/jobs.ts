// Durable job queue in the database. The database is the record; no separate broker to drift out of sync.
// Claiming is one atomic UPDATE ... RETURNING. Leases expire, so a crashed worker's job is picked up again.
// Idempotency keys make "run this again" safe: the same key returns the existing job instead of a duplicate.
import { all, newId, now, one, parse, run, tx } from "./db";

export type JobType = "probe" | "proxy" | "transcribe" | "suggest_clips" | "translate" | "render" | "package";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "blocked";
export type JobRow = {
  id: string; workspace_id: string; project_id: string | null; type: JobType; status: JobStatus;
  input: string; output: string | null; error: string | null; progress: number; stage: string | null;
  attempts: number; max_attempts: number; idempotency_key: string | null; depends_on: string | null;
  run_after: number; lease_until: number | null; worker_id: string | null; created_by: string | null;
  created_at: number; started_at: number | null; finished_at: number | null;
};

export function enqueue(j: {
  workspaceId: string; projectId: string | null; type: JobType; input?: unknown;
  idempotencyKey?: string; dependsOn?: string | null; createdBy?: string | null; maxAttempts?: number;
}): JobRow {
  return tx(() => {
    if (j.idempotencyKey) {
      const existing = one<JobRow>(`SELECT * FROM job WHERE idempotency_key = ?`, j.idempotencyKey);
      if (existing && existing.status !== "failed" && existing.status !== "cancelled") return existing;
      if (existing) run(`UPDATE job SET idempotency_key = NULL WHERE id = ?`, existing.id); // allow a fresh retry
    }
    const id = newId("job");
    run(
      `INSERT INTO job (id, workspace_id, project_id, type, status, input, idempotency_key, depends_on, run_after, created_by, created_at, max_attempts)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)`,
      id, j.workspaceId, j.projectId, j.type, JSON.stringify(j.input ?? {}), j.idempotencyKey ?? null,
      j.dependsOn ?? null, now(), j.createdBy ?? null, now(), j.maxAttempts ?? 3,
    );
    return one<JobRow>(`SELECT * FROM job WHERE id = ?`, id)!;
  });
}

export function claim(workerId: string, leaseMs: number): JobRow | undefined {
  const t = now();
  return one<JobRow>(
    `UPDATE job SET status = 'running', worker_id = ?, lease_until = ?, attempts = attempts + 1, started_at = COALESCE(started_at, ?), error = NULL
     WHERE id = (
       SELECT j.id FROM job j
       WHERE j.status = 'queued' AND j.run_after <= ?
         AND (j.depends_on IS NULL OR EXISTS (SELECT 1 FROM job d WHERE d.id = j.depends_on AND d.status = 'succeeded'))
       ORDER BY j.created_at LIMIT 1
     )
     RETURNING *`,
    workerId, t + leaseMs, t, t,
  );
}

export function heartbeat(id: string, workerId: string, leaseMs: number, progress?: number, stage?: string) {
  run(
    `UPDATE job SET lease_until = ?, progress = COALESCE(?, progress), stage = COALESCE(?, stage) WHERE id = ? AND worker_id = ? AND status = 'running'`,
    now() + leaseMs, progress ?? null, stage ?? null, id, workerId,
  );
}

export function succeed(id: string, output: unknown) {
  run(`UPDATE job SET status = 'succeeded', output = ?, progress = 1, stage = 'done', lease_until = NULL, finished_at = ? WHERE id = ?`, JSON.stringify(output ?? {}), now(), id);
}

export function failJob(id: string, message: string, retryable: boolean) {
  const j = one<JobRow>(`SELECT * FROM job WHERE id = ?`, id);
  if (!j) return;
  if (retryable && j.attempts < j.max_attempts) {
    const backoff = 5000 * 2 ** (j.attempts - 1);
    run(`UPDATE job SET status = 'queued', error = ?, run_after = ?, lease_until = NULL, worker_id = NULL WHERE id = ?`, message, now() + backoff, id);
  } else {
    run(`UPDATE job SET status = 'failed', error = ?, lease_until = NULL, finished_at = ? WHERE id = ?`, message, now(), id);
  }
}

export function block(id: string, reason: string) {
  run(`UPDATE job SET status = 'blocked', error = ?, lease_until = NULL, worker_id = NULL WHERE id = ?`, reason, id);
}

export function cancel(id: string, workspaceId: string) {
  return run(`UPDATE job SET status = 'cancelled', finished_at = ? WHERE id = ? AND workspace_id = ? AND status IN ('queued','blocked','running')`, now(), id, workspaceId).changes > 0;
}

export function retry(id: string, workspaceId: string) {
  return run(
    `UPDATE job SET status = 'queued', run_after = ?, attempts = 0, error = NULL, progress = 0, stage = NULL, finished_at = NULL WHERE id = ? AND workspace_id = ? AND status IN ('failed','cancelled','blocked')`,
    now(), id, workspaceId,
  ).changes > 0;
}

export function isCancelled(id: string) {
  return one<{ status: string }>(`SELECT status FROM job WHERE id = ?`, id)?.status === "cancelled";
}

// Housekeeping each worker tick: expired leases go back to the queue; dependents of failed jobs fail with a reason.
export function sweep() {
  const t = now();
  run(`UPDATE job SET status = 'queued', worker_id = NULL, lease_until = NULL WHERE status = 'running' AND lease_until < ?`, t);
  run(
    `UPDATE job SET status = 'failed', error = 'A step it depends on did not finish.', finished_at = ?
     WHERE status = 'queued' AND depends_on IN (SELECT id FROM job WHERE status IN ('failed','cancelled'))`,
    t,
  );
}

// Blocked jobs (for example renders waiting on consent) re-enter the queue when the blocker clears.
export function requeueBlocked(projectId: string, type: JobType) {
  return run(`UPDATE job SET status = 'queued', error = NULL, run_after = ? WHERE project_id = ? AND type = ? AND status = 'blocked'`, now(), projectId, type).changes;
}

export function projectJobs(projectId: string, limit = 40) {
  return all<JobRow>(`SELECT * FROM job WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`, projectId, limit).map(publicJob);
}

export function publicJob(j: JobRow) {
  return {
    id: j.id, type: j.type, status: j.status, progress: j.progress, stage: j.stage, error: j.error,
    attempts: j.attempts, input: parse<Record<string, unknown>>(j.input, {}), output: parse<Record<string, unknown> | null>(j.output, null),
    createdAt: j.created_at, startedAt: j.started_at, finishedAt: j.finished_at,
  };
}
