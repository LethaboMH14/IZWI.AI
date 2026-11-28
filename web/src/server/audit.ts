import { now, run } from "./db";

export async function audit(e: { workspaceId?: string | null; userId?: string | null; actor: string; action: string; target?: string | null; meta?: unknown }) {
  await run(
    `INSERT INTO audit_log (workspace_id, user_id, actor, action, target, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    e.workspaceId ?? null,
    e.userId ?? null,
    e.actor,
    e.action,
    e.target ?? null,
    e.meta === undefined ? null : JSON.stringify(e.meta),
    now(),
  );
}
