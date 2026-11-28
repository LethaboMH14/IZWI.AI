// GET /api/providers/:id/models → the provider's live model list, cheapest first. The server calls out with the stored
// key through the SSRF guard; the key never reaches the browser. Owner/admin only, like the connection test.
import { fail, route } from "@/server/http";
import { requireCtx, requireRole } from "@/server/guard";
import { one } from "@/server/db";
import { listProviderModels, ProviderError, type ProviderRow } from "@/server/providers";
import { limit, LIMIT } from "@/server/ratelimit";

export const runtime = "nodejs";
type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  const p = await one<ProviderRow>(`SELECT * FROM provider WHERE id = ? AND workspace_id = ?`, id, ctx.workspaceId) ?? fail(404, "Not found.");
  if (p.kind === "ollama") requireRole(ctx, ["owner"]);
  if (p.kind === "madlad_endpoint" || p.kind === "asr_endpoint") fail(409, "This kind of endpoint has no model list.");
  await limit(`provider-test:${ctx.workspaceId}:${ctx.userId}`, LIMIT.providerTest);
  try {
    return { models: await listProviderModels(p) };
  } catch (e) {
    // Provider errors carry fixed messages only, never the upstream body.
    if (e instanceof ProviderError) fail(502, e.message);
    throw e;
  }
});
