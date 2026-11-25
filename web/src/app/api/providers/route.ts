// Bring your own key. The key is sealed before it is stored and never sent back to the browser.
import { z } from "zod";
import { body, route } from "@/server/http";
import { requireCtx, requireRole } from "@/server/guard";
import { all, newId, now, one, run } from "@/server/db";
import { keyHint, seal } from "@/server/crypto";
import { checkBaseUrl, publicProvider, testProvider, type ProviderRow } from "@/server/providers";
import { audit } from "@/server/audit";
import { limit, LIMIT } from "@/server/ratelimit";

export const runtime = "nodejs";

export const GET = route(async () => {
  const ctx = await requireCtx();
  return all<ProviderRow>(`SELECT * FROM provider WHERE workspace_id = ? ORDER BY created_at`, ctx.workspaceId).map(publicProvider);
});

const ProviderIn = z.object({
  kind: z.enum(["openai_compat", "madlad_endpoint", "asr_endpoint", "openrouter", "ollama", "meta"]),
  label: z.string().trim().min(1).max(60),
  baseUrl: z.string().trim().min(8).max(300),
  model: z.string().trim().max(120).optional(),
  key: z.string().trim().max(400).optional(),
  roles: z.array(z.enum(["plan", "translate", "clips", "asr", "chat"])).min(1),
}).refine((x) => !["openai_compat", "openrouter", "ollama", "meta"].includes(x.kind) || !!x.model, { path: ["model"], message: "Add the model name, for example qwen3:4b." });

export const POST = route(async (req) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  limit(`provider-test:${ctx.workspaceId}:${ctx.userId}`, LIMIT.providerTest);
  const x = await body(req, ProviderIn);
  if (x.kind === "ollama") requireRole(ctx, ["owner"]);
  const id = newId("prv");
  run(
    `INSERT INTO provider (id, workspace_id, kind, label, base_url, model, key_sealed, key_hint, roles, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, ctx.workspaceId, x.kind, x.label, checkBaseUrl(x.baseUrl, x.kind), x.model || null, x.key ? seal(x.key) : null, x.key ? keyHint(x.key) : null, JSON.stringify(x.roles), ctx.userId, now(),
  );
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "provider.added", target: id, meta: { kind: x.kind, label: x.label } });
  const row = one<ProviderRow>(`SELECT * FROM provider WHERE id = ?`, id)!;
  const t = await testProvider(row);
  run(`UPDATE provider SET last_test_at = ?, last_test_ok = ?, last_test_note = ? WHERE id = ?`, now(), t.ok ? 1 : 0, t.note, id);
  return publicProvider(one<ProviderRow>(`SELECT * FROM provider WHERE id = ?`, id)!);
});
