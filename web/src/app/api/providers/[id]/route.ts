import { fail, route } from "@/server/http";
import { requireCtx, requireRole } from "@/server/guard";
import { now, one, run } from "@/server/db";
import { testProvider, type ProviderRow } from "@/server/providers";
import { audit } from "@/server/audit";
import { publicProvider } from "@/server/providers";
import { limit, LIMIT } from "@/server/ratelimit";

export const runtime = "nodejs";
type P = { id: string };

const mine = (workspaceId: string, id: string) => one<ProviderRow>(`SELECT * FROM provider WHERE id = ? AND workspace_id = ?`, id, workspaceId) ?? fail(404, "Not found.");

// POST = test the connection again. Owner/admin only: a test makes the server call out to the saved address.
export const POST = route<P>(async (_req, { id }) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  limit(`provider-test:${ctx.workspaceId}:${ctx.userId}`, LIMIT.providerTest);
  const p = mine(ctx.workspaceId, id);
  const t = await testProvider(p);
  run(`UPDATE provider SET last_test_at = ?, last_test_ok = ?, last_test_note = ? WHERE id = ?`, now(), t.ok ? 1 : 0, t.note, p.id);
  return publicProvider(mine(ctx.workspaceId, id));
});

export const DELETE = route<P>(async (_req, { id }) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  const p = mine(ctx.workspaceId, id);
  run(`DELETE FROM provider WHERE id = ?`, p.id);
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "provider.removed", target: p.id });
});
