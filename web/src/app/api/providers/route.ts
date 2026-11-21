// Bring your own key. The key is sealed before it is stored and never sent back to the browser.
import { z } from "zod";
import { body, route } from "@/server/http";
import { requireCtx, requireRole } from "@/server/guard";
import { all, newId, now, one, parse, run } from "@/server/db";
import { keyHint, seal } from "@/server/crypto";
import { checkBaseUrl, testProvider, type ProviderRow } from "@/server/providers";
import { audit } from "@/server/audit";

export const runtime = "nodejs";

export const publicProvider = (p: ProviderRow) => ({
  id: p.id, kind: p.kind, label: p.label, baseUrl: p.base_url, model: p.model, keyHint: p.key_hint, roles: parse<string[]>(p.roles, []),
  lastTestAt: p.last_test_at, lastTestOk: p.last_test_ok === null ? null : p.last_test_ok === 1, lastTestNote: p.last_test_note,
});

export const GET = route(async () => {
  const ctx = await requireCtx();
  return all<ProviderRow>(`SELECT * FROM provider WHERE workspace_id = ? ORDER BY created_at`, ctx.workspaceId).map(publicProvider);
});

const ProviderIn = z.object({
  kind: z.enum(["openai_compat", "madlad_endpoint", "asr_endpoint"]),
  label: z.string().trim().min(1).max(60),
  baseUrl: z.string().trim().min(8).max(300),
  model: z.string().trim().max(120).optional(),
  key: z.string().trim().max(400).optional(),
  roles: z.array(z.enum(["plan", "translate", "clips", "asr"])).min(1),
});

export const POST = route(async (req) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  const x = await body(req, ProviderIn);
  const id = newId("prv");
  run(
    `INSERT INTO provider (id, workspace_id, kind, label, base_url, model, key_sealed, key_hint, roles, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, ctx.workspaceId, x.kind, x.label, checkBaseUrl(x.baseUrl), x.model || null, x.key ? seal(x.key) : null, x.key ? keyHint(x.key) : null, JSON.stringify(x.roles), ctx.userId, now(),
  );
  audit({ workspaceId: ctx.workspaceId, userId: ctx.userId, actor: "user", action: "provider.added", target: id, meta: { kind: x.kind, label: x.label } });
  const row = one<ProviderRow>(`SELECT * FROM provider WHERE id = ?`, id)!;
  const t = await testProvider(row);
  run(`UPDATE provider SET last_test_at = ?, last_test_ok = ?, last_test_note = ? WHERE id = ?`, now(), t.ok ? 1 : 0, t.note, id);
  return publicProvider(one<ProviderRow>(`SELECT * FROM provider WHERE id = ?`, id)!);
});
