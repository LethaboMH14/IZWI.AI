import { body, fail, route } from "@/server/http";
import { z } from "zod";
import { requireCtx, requireRole } from "@/server/guard";
import { now, one, run } from "@/server/db";
import { canMarkFreeTier, requireBaseUrl, testProvider, type ProviderRow } from "@/server/providers";
import { audit } from "@/server/audit";
import { publicProvider } from "@/server/providers";
import { limit, LIMIT } from "@/server/ratelimit";
import { keyHint, seal } from "@/server/crypto";

export const runtime = "nodejs";
type P = { id: string };

const mine = async (workspaceId: string, id: string) => await one<ProviderRow>(`SELECT * FROM provider WHERE id = ? AND workspace_id = ?`, id, workspaceId) ?? fail(404, "Not found.");

const PatchIn = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  baseUrl: z.string().trim().min(8).max(300).optional(),
  model: z.string().trim().max(120).nullable().optional(),
  key: z.string().trim().max(400).optional(),
  roles: z.array(z.enum(["plan", "translate", "chat"])).min(1).optional(),
  freeTier: z.boolean().optional(),
}).strict();

export const PATCH = route<P>(async (req, { id }) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  const p = await mine(ctx.workspaceId, id);
  const x = await body(req, PatchIn);
  if (x.freeTier !== undefined && !canMarkFreeTier(ctx.role)) requireRole(ctx, ["owner"]);
  if (p.kind === "ollama") requireRole(ctx, ["owner"]);
  const baseUrl = x.baseUrl === undefined ? p.base_url : requireBaseUrl(x.baseUrl, p.kind);
  // A stored key belongs to the address it was entered for. A new address needs the key typed again.
  const moved = baseUrl !== p.base_url;
  await run(`UPDATE provider SET label = ?, base_url = ?, model = ?, key_sealed = ?, key_hint = ?, roles = ?, free_tier = ?,
       last_test_at = NULL, last_test_ok = NULL, last_test_note = NULL WHERE id = ? AND workspace_id = ?`,
    x.label ?? p.label, baseUrl,
    x.model === undefined ? p.model : x.model, x.key ? seal(x.key) : moved ? null : p.key_sealed,
    x.key ? keyHint(x.key) : moved ? null : p.key_hint, JSON.stringify(x.roles ?? JSON.parse(p.roles) as string[]), x.freeTier === undefined ? p.free_tier ?? 0 : x.freeTier ? 1 : 0, p.id, ctx.workspaceId);
  await audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "provider.updated", target: p.id, meta: { kind: p.kind } });
  return publicProvider(await mine(ctx.workspaceId, p.id));
});

// POST = test the connection again. Owner/admin only: a test makes the server call out to the saved address.
export const POST = route<P>(async (_req, { id }) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  await limit(`provider-test:${ctx.workspaceId}:${ctx.userId}`, LIMIT.providerTest);
  const p = await mine(ctx.workspaceId, id);
  const t = await testProvider(p);
  await run(`UPDATE provider SET last_test_at = ?, last_test_ok = ?, last_test_note = ? WHERE id = ?`, now(), t.ok ? 1 : 0, t.note, p.id);
  return publicProvider(await mine(ctx.workspaceId, id));
});

export const DELETE = route<P>(async (_req, { id }) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  const p = await mine(ctx.workspaceId, id);
  await run(`DELETE FROM provider WHERE id = ?`, p.id);
  await audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "provider.removed", target: p.id });
});
