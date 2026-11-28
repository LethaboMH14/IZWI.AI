import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx, requireRole } from "@/server/guard";
import { all, now, one, parse, run } from "@/server/db";
import { privacyOf, type ProviderRow } from "@/server/providers";

export const runtime = "nodejs";
const roles = ["chat", "plan", "translate", "clips"] as const;
const Input = z.object({ routes: z.array(z.object({ role: z.enum(roles), providerId: z.string().min(1), model: z.string().trim().min(1).max(120) }).strict()).max(4) }).strict();

export const GET = route(async () => {
  const ctx = await requireCtx();
  const providers = await all<ProviderRow>("SELECT * FROM provider WHERE workspace_id = ? ORDER BY created_at", ctx.workspaceId);
  const routed = await all<{ role: typeof roles[number]; provider_id: string; model: string }>("SELECT role,provider_id,model FROM model_route WHERE workspace_id = ?", ctx.workspaceId);
  return { canEdit: ["owner", "admin"].includes(ctx.role), canFreeTier: ctx.role === "owner", routes: routed.map((r) => ({ role: r.role, providerId: r.provider_id, model: r.model })), providers: providers.map((p) => ({ id: p.id, label: p.label, kind: p.kind, model: p.model, roles: parse<string[]>(p.roles, []), ready: p.last_test_ok === 1, privacy: privacyOf(p) })) };
});

export const PUT = route(async (req) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  const x = await body(req, Input);
  if (new Set(x.routes.map((r) => r.role)).size !== x.routes.length) fail(400, "Each task may have one route.");
  for (const item of x.routes) {
    const p = await one<ProviderRow>("SELECT * FROM provider WHERE id = ? AND workspace_id = ? AND last_test_ok = 1", item.providerId, ctx.workspaceId);
    if (!p || !parse<string[]>(p.roles, []).includes(item.role)) fail(400, "Choose a tested provider enabled for this task.");
  }
  await run("DELETE FROM model_route WHERE workspace_id = ?", ctx.workspaceId);
  for (const item of x.routes) await run("INSERT INTO model_route(workspace_id,role,provider_id,model,updated_by,updated_at) VALUES(?,?,?,?,?,?)", ctx.workspaceId, item.role, item.providerId, item.model, ctx.userId, now());
  return { saved: x.routes.length };
});
