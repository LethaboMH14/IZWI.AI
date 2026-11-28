// Bring your own key. The key is sealed before it is stored and never sent back to the browser.
import { z } from "zod";
import { body, route } from "@/server/http";
import { requireCtx, requireRole } from "@/server/guard";
import { all, newId, now, one, run } from "@/server/db";
import { keyHint, seal } from "@/server/crypto";
import { canMarkFreeTier, checkBaseUrl, publicProvider, testProvider, type ProviderRow } from "@/server/providers";
import { audit } from "@/server/audit";
import { limit, LIMIT } from "@/server/ratelimit";

export const runtime = "nodejs";

export const GET = route(async () => {
  const ctx = await requireCtx();
  return (await all<ProviderRow>(`SELECT * FROM provider WHERE workspace_id = ? ORDER BY created_at`, ctx.workspaceId)).map(publicProvider);
});

const ProviderIn = z.object({
  kind: z.enum(["openai_compat", "madlad_endpoint", "asr_endpoint", "openrouter", "groq", "gemini", "aimlapi", "ollama", "meta"]),
  label: z.string().trim().min(1).max(60),
  baseUrl: z.string().trim().min(8).max(300),
  model: z.string().trim().max(120).optional(),
  key: z.string().trim().max(400).optional(),
  roles: z.array(z.enum(["plan", "translate", "clips", "asr", "chat"])).min(1),
  freeTier: z.boolean().optional(),
}).refine((x) => !["openai_compat", "openrouter", "groq", "gemini", "aimlapi", "ollama", "meta"].includes(x.kind) || !!x.model, { path: ["model"], message: "Load and choose a model first." });

export const POST = route(async (req) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  await limit(`provider-test:${ctx.workspaceId}:${ctx.userId}`, LIMIT.providerTest);
  const x = await body(req, ProviderIn);
  if (x.freeTier && !canMarkFreeTier(ctx.role)) requireRole(ctx, ["owner"]);
  if (x.kind === "ollama") requireRole(ctx, ["owner"]);
  const id = newId("prv");
  await run(
    `INSERT INTO provider (id, workspace_id, kind, label, base_url, model, key_sealed, key_hint, roles, free_tier, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, ctx.workspaceId, x.kind, x.label, checkBaseUrl(x.baseUrl, x.kind), x.model || null, x.key ? seal(x.key) : null, x.key ? keyHint(x.key) : null, JSON.stringify(x.roles), x.freeTier ? 1 : 0, ctx.userId, now(),
  );
  await audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "provider.added", target: id, meta: { kind: x.kind, label: x.label } });
  const row = (await one<ProviderRow>(`SELECT * FROM provider WHERE id = ?`, id))!;
  const t = await testProvider(row);
  await run(`UPDATE provider SET last_test_at = ?, last_test_ok = ?, last_test_note = ? WHERE id = ?`, now(), t.ok ? 1 : 0, t.note, id);
  return publicProvider((await one<ProviderRow>(`SELECT * FROM provider WHERE id = ?`, id))!);
});
