import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createUIMessageStream, createUIMessageStreamResponse, streamText } from "ai";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { all, newId, now, one, parse, run, tx } from "../../../../../server/db";
import { HttpError, route, readCapped } from "../../../../../server/http";
import { requireCtx, projectOf } from "../../../../../server/guard";
import { limit, LIMIT, RateLimitError } from "../../../../../server/ratelimit";
import { acquireLease, renewLease, releaseLease, reserveAttempt, settleAttempt, BudgetError, type BudgetReceipt } from "../../../../../server/budget";
import { sdkFetch } from "../../../../../server/sdk-fetch";
import { recordTrialTokens, trialFetch } from "../../../../../server/provider-trial";
import { unseal } from "../../../../../server/crypto";
import { privacyOf, type ProviderRow } from "../../../../../server/providers";
import { PUBLIC_URL } from "../../../../../server/env";
import { assistantTools, buildAssistantContext, persistProposals, saveAssistantTurn, type Proposal, redactForMayLog } from "../../../../../server/assistant";
import { assistantEnabled } from "../../../../../server/flags";

const Input = z.object({ threadId: z.string().min(1).optional(), providerId: z.string().min(1), text: z.string().min(1).max(2000) }).strict();
const idSchema = z.string().min(1);

// Kill switch: with the assistant off, both routes answer 404 before reading the body or the session.
function requireAssistant() {
  if (!assistantEnabled()) throw new HttpError(404, "Not found.");
}

export const GET = route<{ id: string }>(async (_req, { id }) => {
  requireAssistant();
  idSchema.parse(id);
  const ctx = await requireCtx();
  await projectOf(ctx, id);
  const providers = (await all<ProviderRow>(`SELECT * FROM provider WHERE workspace_id = ? AND last_test_ok = 1 ORDER BY created_at`, ctx.workspaceId))
    .filter((p) => parse<string[]>(p.roles, []).includes("chat"))
    .map((p) => ({ id: p.id, label: p.label, kind: p.kind, model: p.model, privacy: privacyOf(p), ready: true }));
  const thread = await one<{ id: string }>(`SELECT id FROM assistant_thread WHERE project_id = ? AND workspace_id = ? AND created_by = ? ORDER BY created_at DESC LIMIT 1`, id, ctx.workspaceId, ctx.userId);
  const messages = thread ? await Promise.all((await all(`SELECT id, role, text, provider_label, model, privacy, redacted, excluded_lines, proposals, created_at FROM assistant_message WHERE thread_id = ? ORDER BY created_at`, thread.id)).map(async (m: Record<string, unknown>) => ({ id: m.id, role: m.role, text: m.text, provider: { label: m.provider_label, model: m.model, privacy: m.privacy }, redacted: m.redacted, excludedLines: m.excluded_lines, proposals: await withStatus(parse<Proposal[]>(m.proposals, []), ctx.workspaceId), createdAt: m.created_at }))) : [];
  const dayKey = Math.floor(now() / LIMIT.assistantDay.windowMs) * LIMIT.assistantDay.windowMs;
  const used = (await one<{ count: number }>(`SELECT count FROM rate_limit WHERE key = ? AND window_start = ?`, `assistant-day:${ctx.workspaceId}:${ctx.userId}`.slice(0, 200), dayKey))?.count ?? 0;
  return { providers, thread: thread ? { id: thread.id, messages } : null, limits: { perMinute: LIMIT.assistant.max, perDay: LIMIT.assistantDay.max, usedToday: used } };
});

// Stored cards carry the plan's current status, so an approved or dismissed card never offers its buttons again.
async function withStatus(proposals: Proposal[], workspaceId: string) {
  return Promise.all(proposals.map(async (p) => ({ ...p, status: (await one<{ status: string }>(`SELECT status FROM plan_run WHERE id = ? AND workspace_id = ?`, p.planId, workspaceId))?.status ?? "missing" })));
}

// Text-only tool results, as the lines the creator should see. Everything else (proposals) renders as cards.
export function draftText(toolName: string, output: unknown): string[] {
  const o = (output ?? {}) as { titles?: unknown; caption?: unknown; post?: unknown };
  if (toolName === "draftTitles" && Array.isArray(o.titles)) {
    const titles = o.titles.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
    return titles.length ? ["Draft titles:", ...titles.map((t) => `- ${t.trim()}`)] : [];
  }
  if (toolName === "draftCaptionPost") {
    const lines: string[] = [];
    if (typeof o.caption === "string" && o.caption.trim()) lines.push(`Draft caption: ${o.caption.trim()}`);
    if (typeof o.post === "string" && o.post.trim()) lines.push(`Draft post: ${o.post.trim()}`);
    return lines;
  }
  return [];
}

export function canaryFilter(canary: string, secrets: string[] = []) {
  let tail = "";
  const markers = [canary, ...secrets.filter(Boolean)];
  return {
    push(chunk: string): string {
      const input = tail + chunk;
      if (markers.some((s) => input.includes(s))) throw new Error("CANARY");
      const keep = Math.max(0, ...markers.map((s) => s.length - 1));
      const safe = input.slice(0, Math.max(0, input.length - keep));
      tail = input.slice(safe.length);
      return safe;
    },
    flush() {
      if (markers.some((s) => tail.includes(s))) throw new Error("CANARY");
      const out = tail; tail = ""; return out;
    },
  };
}

export function meteredFetch(current: () => BudgetReceipt | null, fetcher: typeof fetch = sdkFetch, onViolation: () => void = () => {}): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : null;
    const body = init?.body !== undefined ? init.body : request?.body ? (await request.clone()).arrayBuffer() : null;
    let bytes = 0;
    if (typeof body === "string") bytes = Buffer.byteLength(body, "utf8");
    else if (body instanceof ArrayBuffer) bytes = body.byteLength;
    else if (body instanceof Uint8Array) bytes = body.byteLength;
    else if (typeof Blob !== "undefined" && body instanceof Blob) bytes = body.size;
    else if (body !== null && body !== undefined) { onViolation(); throw new BudgetError("The outbound request body cannot be metered safely."); }
    const receipt = current();
    if (!receipt || bytes > receipt.requestBytes) { onViolation(); throw new BudgetError("The serialized model request exceeded its reserved byte allowance."); }
    return fetcher(input, init);
  };
}

function containsSecret(value: unknown, secrets: string[]): boolean {
  if (typeof value === "string") return secrets.some((secret) => secret.length > 0 && value.includes(secret));
  if (Array.isArray(value)) return value.some((item) => containsSecret(item, secrets));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsSecret(item, secrets));
  return false;
}

export const POST = route<{ id: string }>(async (req, { id }) => {
  requireAssistant();
  const raw = await readCapped(req, 16 * 1024);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { throw new HttpError(400, "Send a JSON body."); }
  const input = Input.parse(payload);
  const ctx = await requireCtx();
  await projectOf(ctx, id);
  try {
    await limit(`assistant:${ctx.workspaceId}:${ctx.userId}`, LIMIT.assistant);
    await limit(`assistant-day:${ctx.workspaceId}:${ctx.userId}`, LIMIT.assistantDay);
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: e.message, retryAfter: e.retryAfterSec }, { status: 429, headers: { "Retry-After": String(e.retryAfterSec) } });
    throw e;
  }
  const provider = await one<ProviderRow>(`SELECT * FROM provider WHERE id = ? AND workspace_id = ? AND last_test_ok = 1`, input.providerId, ctx.workspaceId);
  if (!provider || !parse<string[]>(provider.roles, []).includes("chat")) throw new HttpError(404, "Provider not found.");
  if (!provider.model) throw new HttpError(409, "Choose a model for this provider first.");
  const privacy = privacyOf(provider);
  const thread = input.threadId
    ? await one<{ id: string }>(`SELECT id FROM assistant_thread WHERE id = ? AND project_id = ? AND workspace_id = ? AND created_by = ?`, input.threadId, id, ctx.workspaceId, ctx.userId)
    : undefined;
  if (input.threadId && !thread) throw new HttpError(404, "Thread not found.");
  const threadId = thread?.id ?? newId("ath");
  if (!thread) await run(`INSERT INTO assistant_thread (id, workspace_id, project_id, created_by, created_at) VALUES (?, ?, ?, ?, ?)`, threadId, ctx.workspaceId, id, ctx.userId, now());
  if (!await acquireLease(ctx.userId, ctx.workspaceId)) return Response.json({ error: "Another assistant response is still open.", retryAfter: 60 }, { status: 429, headers: { "Retry-After": "60" } });
  try {
    return await startTurn(req, id, ctx, input, provider, privacy, threadId);
  } catch (e) {
    // Setup failed before the stream took ownership of the lease; release it now instead of waiting for expiry.
    await releaseLease(ctx.userId, ctx.workspaceId);
    throw e;
  }
});

async function startTurn(
  req: Request, id: string, ctx: Awaited<ReturnType<typeof requireCtx>>, input: z.infer<typeof Input>,
  provider: ProviderRow, privacy: ReturnType<typeof privacyOf>, threadId: string,
) {
  const requestId = randomUUID();
  const startedAt = now();
  const context = await buildAssistantContext(ctx, id, privacy);
  const oldMessages = (await all<{ role: string; text: string }>(`SELECT role, text FROM assistant_message WHERE thread_id = ? ORDER BY created_at DESC LIMIT 20`, threadId)).reverse();
  const names = (await all<{ name: string }>(`SELECT name FROM person WHERE project_id = ? AND workspace_id = ?`, id, ctx.workspaceId)).map((p) => p.name);
  let redacted = context.redacted;
  const conversation = oldMessages.map((m) => {
    if (privacy !== "may_log") return { role: m.role as "user" | "assistant", content: m.text };
    const r = redactForMayLog(m.text, names); redacted += r.count; return { role: m.role as "user" | "assistant", content: r.text };
  });
  const userText = privacy === "may_log" ? redactForMayLog(input.text, names) : { text: input.text, count: 0 };
  redacted += userText.count;
  const messages = [...conversation, { role: "user" as const, content: userText.text }];
  const proposals: Parameters<typeof persistProposals>[2] = [];
  const decodedToolInputs: unknown[] = [];
  const tools = await assistantTools(ctx, id, proposals, context.sourceHasTranscript, decodedToolInputs);
  const key = provider.key_sealed ? unseal(provider.key_sealed) : "";
  const headers: Record<string, string> = provider.kind === "openrouter" ? { "HTTP-Referer": PUBLIC_URL, "X-Title": "IZWI AI" } : {};
  const receipts = new Map<number, BudgetReceipt>();
  let activeReceipt: BudgetReceipt | null = null;
  let budgetViolation = false;
  const refuse = () => { budgetViolation = true; };
  // Hosted trial: the same per-route request and spend caps as planning, translation and the connection test.
  let trialReceipt: Parameters<typeof recordTrialTokens>[0] = null;
  const capped = trialFetch(provider, sdkFetch, { reserved: (r) => { trialReceipt = r; }, refused: refuse });
  const compatible = createOpenAICompatible({ baseURL: provider.base_url, name: `izwi-${provider.kind}`, apiKey: key || undefined, headers, fetch: meteredFetch(() => activeReceipt, capped, refuse), includeUsage: true });
  if (!provider.model) throw new HttpError(409, "Choose a model for this provider first.");
  const model = compatible.chatModel(provider.model);
  let attempts = 0, tokensIn: number | null = 0, tokensOut: number | null = 0, outcome = "error";
  const modelAbort = new AbortController();
  const disconnect = () => modelAbort.abort();
  req.signal.addEventListener("abort", disconnect, { once: true });
  const renew = setInterval(async () => { if (!await renewLease(ctx.userId, ctx.workspaceId)) modelAbort.abort(); }, 20_000);
  const stream = createUIMessageStream({ execute: async ({ writer }) => {
    writer.write({ type: "data-meta", data: { threadId, messageId: newId("asm"), provider: { label: provider.label, model: provider.model, privacy }, redacted, excludedLines: context.excludedLines } } as never);
    const filter = canaryFilter(context.canary, [key]);
    const toolFilter = canaryFilter(context.canary, [key]);
    const textId = "assistant-text";
    writer.write({ type: "text-start", id: textId } as never);
    try {
      // Installed AI SDK contract: streamText(options: StreamTextOptions<TOOLS,...>): StreamTextResult<TOOLS,...>; result.fullStream: AsyncIterableStream<TextStreamPart<TOOLS>>.
      // UI adapter contract: createUIMessageStream({ execute({ writer }) }) returns a ReadableStream<InferUIMessageChunk<UI_MESSAGE>>.
      // Local models on a laptop CPU are slow (measured: qwen3:1.7b took ~140 s for a short tool call with the app running),
      // so the private class gets a longer limit. Qwen3 also "thinks" before answering unless reasoning is switched off.
      const local = provider.kind === "ollama";
      // Meta's Muse Spark cannot switch thinking off, thinks at "high" unless told otherwise, and counts that thinking
      // against the reply limit: at 800 tokens it answered with nothing. See https://dev.meta.ai/docs/reasoning.
      const meta = provider.kind === "meta";
      const maxOutputTokens = meta ? 3000 : 800;
      const result = streamText({ model, system: context.system, messages, tools, maxRetries: 0, maxOutputTokens, abortSignal: modelAbort.signal,
        timeout: local ? 180_000 : 30_000,
        ...(local ? { providerOptions: { openaiCompatible: { reasoningEffort: "none" } } } : {}),
        ...(meta ? { providerOptions: { openaiCompatible: { reasoningEffort: "low" } } } : {}),
        // ai@7 calls this on every turn, with an empty list when nothing needs downloading.
        // Refuse any real URL; let an empty list through, or no text turn could ever run.
        experimental_download: async (requested: unknown[]) => {
          if (requested.length > 0) throw new Error("URL downloads are disabled.");
          return [];
        },
        prepareStep: async ({ messages: stepMessages }) => {
          attempts++;
          const toolSchemas = Object.entries(tools).map(([name, value]) => {
            const t = value as unknown as { description?: string; inputSchema?: z.ZodTypeAny };
            return { name, description: t.description, schema: t.inputSchema ? z.toJSONSchema(t.inputSchema) : null };
          });
          // R10'': reserve one input token per allowed UTF-8 body byte; meteredFetch checks the SDK's actual serialized body before network I/O.
          const bytes = Buffer.byteLength(JSON.stringify({ model: provider.model, system: context.system, messages: stepMessages, tools: toolSchemas, maxOutputTokens })) + 2048;
          try {
            const receipt = await reserveAttempt({ workspaceId: ctx.workspaceId, userId: ctx.userId, providerId: provider.id, model: provider.model!, provider, serializedRequestBytes: bytes, maxOutputTokens });
            receipts.set(attempts, receipt);
            activeReceipt = receipt;
          }
          catch (e) { throw new BudgetError(e instanceof Error ? e.message : "Assistant budget unavailable."); }
          return {};
        },
        onStepEnd: async ({ usage }) => {
          const receipt = receipts.get(attempts);
          const hasCompleteUsage = Number.isSafeInteger(usage.inputTokens) && Number.isSafeInteger(usage.outputTokens);
          if (hasCompleteUsage && receipt) {
            if (tokensIn !== null) tokensIn += usage.inputTokens!;
            if (tokensOut !== null) tokensOut += usage.outputTokens!;
            await settleAttempt(receipt, { input: usage.inputTokens!, output: usage.outputTokens! });
          } else {
            tokensIn = null; tokensOut = null;
            if (receipt) await settleAttempt(receipt, null);
          }
          if (activeReceipt === receipt) activeReceipt = null;
          await recordTrialTokens(trialReceipt, usage.inputTokens, usage.outputTokens);
          trialReceipt = null;
        },
      });
      // Draft tools (titles, caption posts) return text only. Small models often answer with just a tool call,
      // so their results must become visible text, or the creator sees an empty reply.
      const drafted: string[] = [];
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          const safe = filter.push(part.text);
          if (safe) writer.write({ type: "text-delta", id: textId, delta: safe } as never);
        } else if (part.type === "tool-input-delta") toolFilter.push(part.delta);
        else if (part.type === "tool-result") drafted.push(...draftText(part.toolName, part.output));
        else if (part.type === "error") throw part.error;
      }
      const rest = filter.flush(); if (rest) writer.write({ type: "text-delta", id: textId, delta: rest } as never);
      const modelText = await result.text;
      if (containsSecret(modelText, [context.canary, key]) || containsSecret(drafted, [context.canary, key]) || containsSecret(proposals, [context.canary, key]) || containsSecret(decodedToolInputs, [context.canary, key])) throw new Error("CANARY");
      // Never end a turn silently: say what came back, or that nothing usable did.
      const tail: string[] = [];
      if (drafted.length) tail.push(drafted.join("\n"));
      if (!modelText.trim() && !drafted.length) {
        tail.push(proposals.length
          ? `Here ${proposals.length === 1 ? "is 1 suggestion" : `are ${proposals.length} suggestions`} to review. Nothing changes until you approve.`
          : "I couldn't come up with a usable suggestion this time. Try asking again, a little more specifically, or use a larger model.");
      }
      const extra = tail.length ? `${modelText.trim() ? "\n\n" : ""}${tail.join("\n\n")}` : "";
      if (extra) writer.write({ type: "text-delta", id: textId, delta: extra } as never);
      writer.write({ type: "text-end", id: textId } as never);
      const finalText = modelText + extra;
      let saved: Proposal[] = [];
      await tx(async () => {
        saved = await persistProposals(ctx, id, proposals, provider, threadId);
        await saveAssistantTurn({ threadId, projectId: id, workspaceId: ctx.workspaceId, provider, text: input.text, assistantText: finalText, redacted, excludedLines: context.excludedLines, proposals: saved, requestId, tokensIn, tokensOut });
      });
      writer.write({ type: "data-proposals", data: { proposals: saved } } as never);
      outcome = "ok";
    } catch (e) {
      const canary = e instanceof Error && e.message === "CANARY";
      const budget = budgetViolation || e instanceof BudgetError;
      const code = canary ? "canary" : budget ? "budget" : req.signal.aborted ? "timeout" : "provider";
      outcome = code === "timeout" ? "aborted" : code === "provider" ? "error" : code;
      writer.write({ type: "data-error", data: { code, message: canary ? "The response was stopped by a safety check." : budget ? "The workspace assistant budget is unavailable." : "The assistant could not finish this response." } } as never);
    } finally {
      for (const receipt of receipts.values()) if (!receipt.settled) { try { await settleAttempt(receipt, null); } catch {} }
      clearInterval(renew);
      req.signal.removeEventListener("abort", disconnect);
      await releaseLease(ctx.userId, ctx.workspaceId);
      console.info(JSON.stringify({ requestId, providerId: provider.id, model: provider.model, privacy, attempts, tokensIn, tokensOut, redacted, outcome, durationMs: now() - startedAt }));
    }
  }, onError: () => "The assistant could not finish this response." });
  return createUIMessageStreamResponse({ stream });
}
