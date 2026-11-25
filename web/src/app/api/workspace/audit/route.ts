// Owner-only audit trail for the active workspace: provider changes, approvals, project edits, deletes, consent answers.
// Newest first, 200 at a time; pass ?before=<id> for the next page.
import { route } from "@/server/http";
import { requireCtx, requireRole } from "@/server/guard";
import { all, parse } from "@/server/db";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner"]);
  const before = Number(new URL(req.url).searchParams.get("before") ?? "") || Number.MAX_SAFE_INTEGER;
  const rows = all<{ id: number; user_id: string | null; actor: string; action: string; target: string | null; meta: string | null; created_at: number; name: string | null }>(
    `SELECT a.id, a.user_id, a.actor, a.action, a.target, a.meta, a.created_at, u.name
       FROM audit_log a LEFT JOIN "user" u ON u.id = a.user_id
      WHERE a.workspace_id = ? AND a.id < ? ORDER BY a.id DESC LIMIT 200`,
    ctx.workspaceId, before,
  );
  return rows.map((r) => ({ id: r.id, at: r.created_at, actor: r.actor, who: r.name, action: r.action, target: r.target, meta: parse(r.meta, null) }));
});
