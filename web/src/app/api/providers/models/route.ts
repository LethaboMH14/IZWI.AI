// Preflight model discovery for the Connections wizard. Credentials are sealed in memory for the duration of
// the request and all outbound traffic still goes through listProviderModels/sdkFetch.
import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx, requireRole } from "@/server/guard";
import { newId, now } from "@/server/db";
import { seal } from "@/server/crypto";
import { listProviderModels, ProviderError, PROVIDER_PRESETS, requireBaseUrl, type ProviderKind, type ProviderRow } from "@/server/providers";
import { limit, LIMIT } from "@/server/ratelimit";

export const runtime = "nodejs";

const Input = z.object({
  kind: z.enum(["ollama", "groq", "gemini", "meta", "openrouter", "aimlapi", "openai_compat"]),
  baseUrl: z.string().trim().min(8).max(300).optional(),
  key: z.string().trim().max(400).optional(),
  freeTier: z.boolean().optional(),
}).refine((input) => input.kind !== "openai_compat" || !!input.baseUrl, { path: ["baseUrl"], message: "A provider address is required." });

export const POST = route(async (req) => {
  const ctx = await requireCtx();
  requireRole(ctx, ["owner", "admin"]);
  const input = await body(req, Input);
  if (input.kind === "ollama") requireRole(ctx, ["owner"]);
  if (input.kind !== "ollama" && !input.key) fail(400, "Paste your provider key before loading models.");
  if (input.freeTier && ctx.role !== "owner") requireRole(ctx, ["owner"]);
  await limit(`provider-test:${ctx.workspaceId}:${ctx.userId}`, LIMIT.providerTest);

  const kind = input.kind as ProviderKind;
  const preset = kind === "openai_compat" ? null : PROVIDER_PRESETS[kind as keyof typeof PROVIDER_PRESETS];
  const provider: ProviderRow = {
    id: newId("preview"), workspace_id: ctx.workspaceId, kind, label: preset?.label ?? "OpenAI-compatible provider",
    base_url: requireBaseUrl(kind === "openai_compat" ? input.baseUrl! : input.kind === "ollama" ? input.baseUrl ?? preset!.baseUrl : preset!.baseUrl, kind), model: null,
    key_sealed: input.key ? seal(input.key) : null, key_hint: null,
    roles: JSON.stringify(["plan", "translate", "chat"]), free_tier: input.freeTier ? 1 : 0,
    last_test_at: null, last_test_ok: null, last_test_note: null,
    created_by: ctx.userId, created_at: now(),
  };
  try {
    return { models: await listProviderModels(provider) };
  } catch (error) {
    if (error instanceof ProviderError) fail(502, error.message);
    throw error;
  }
});
