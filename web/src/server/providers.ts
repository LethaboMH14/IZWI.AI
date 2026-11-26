// Bring your own model. One adapter for any OpenAI-compatible chat API (AI/ML API, Meta Llama API, Ollama,
// vLLM, LM Studio...), one for a MADLAD-400 translation endpoint, one for a speech endpoint.
// The model proposes; code validates the shape and the rules before anything is saved.
import { z } from "zod";
import { all, one, parse } from "./db";
import { unseal } from "./crypto";
import net from "node:net";
import { BlockedAddressError, type GuardedInit } from "./ssrf";
import { sdkFetch } from "./sdk-fetch";
import { PUBLIC_URL } from "./env";
import { recordTrialTokens, reserveTrialCall, TrialPolicyError, trialEnabled } from "./provider-trial";

export type ProviderKind = "openai_compat" | "madlad_endpoint" | "asr_endpoint" | "openrouter" | "groq" | "gemini" | "aimlapi" | "ollama" | "meta";
export type ProviderRow = {
  id: string; workspace_id: string; kind: ProviderKind; label: string; base_url: string; model: string | null;
  key_sealed: string | null; key_hint: string | null; roles: string; free_tier?: number; last_test_at: number | null;
  last_test_ok: number | null; last_test_note: string | null; created_by: string; created_at: number;
};
export type Role = "plan" | "translate" | "clips" | "chat";
export type Privacy = "private" | "standard" | "may_log";
export const canMarkFreeTier = (workspaceRole: string) => workspaceRole === "owner";

function loopback(host: string): boolean {
  const name = host.replace(/^\[|\]$/g, "").toLowerCase();
  return name === "localhost" || (net.isIP(name) === 4 && name.startsWith("127.")) || name === "::1";
}

export function privacyOf(p: Pick<ProviderRow, "kind" | "base_url">): Privacy {
  let url: URL;
  try { url = new URL(p.base_url); } catch { return "may_log"; }
  if (p.kind === "ollama" && loopback(url.hostname)) return "private";
  if (p.kind === "meta" && url.protocol === "https:" && url.hostname === "api.meta.ai") return "standard";
  return "may_log";
}

export const PROVIDER_PRESETS = {
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", verified: true },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", verified: true },
  gemini: { label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", verified: true },
  aimlapi: { label: "AI/ML API", baseUrl: "https://api.aimlapi.com/v1", verified: true },
  meta: { label: "Meta Model API (Standard mode)", baseUrl: "https://api.meta.ai/v1", verified: true },
  ollama: { label: "Ollama (this machine)", baseUrl: "http://127.0.0.1:11434/v1", verified: true },
} as const;

export type ModelPrice = { in: number; out: number; source: string; asOf: string; currency: "USD" };
// Rates are USD per million tokens from the provider's own price list. See engineering/PROVIDERS.md.
export const PRICE_PER_MTOK: Record<string, ModelPrice> = {
  "openai/gpt-oss-120b": { in: 0.15, out: 0.60, source: "https://console.groq.com/docs/models", asOf: "2026-11-26", currency: "USD" },
  "openai/gpt-oss-20b": { in: 0.075, out: 0.30, source: "https://console.groq.com/docs/models", asOf: "2026-11-26", currency: "USD" },
};

export const publicProvider = (p: ProviderRow) => ({
  id: p.id, kind: p.kind, label: p.label, baseUrl: p.base_url, model: p.model, keyHint: p.key_hint, roles: parse<string[]>(p.roles, []),
  privacy: privacyOf(p), freeTier: p.free_tier === 1, lastTestAt: p.last_test_at, lastTestOk: p.last_test_ok === null ? null : p.last_test_ok === 1, lastTestNote: p.last_test_note,
});

export class ProviderError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

export type ListedModel = { id: string; label: string; contextTokens?: number; costTag: "Free" | "Cheap" | "Moderate" | "Expensive" | "Unknown"; estRandPerTurn?: number; estUsdPerTurn?: number; rateAsOf?: string; priceSource?: string };
const modelCache = new Map<string, { at: number; rows: ListedModel[] }>();
const livePrices = new Map<string, { in: number; out: number; at: number }>();
const MODEL_TTL = 10 * 60_000;
const livePriceKey = (model: string, provider: Pick<ProviderRow, "kind" | "base_url">) => `${provider.kind}\n${provider.base_url}\n${model}`;
export function livePriceFor(model: string, provider?: Pick<ProviderRow, "kind" | "base_url">): { in: number; out: number } | null {
  if (!provider) return null;
  const found = livePrices.get(livePriceKey(model, provider));
  return found && Date.now() - found.at < MODEL_TTL ? { in: found.in * 1_000_000, out: found.out * 1_000_000 } : null;
}
export async function listProviderModels(p: ProviderRow): Promise<ListedModel[]> {
  const cached = modelCache.get(p.id);
  if (cached && Date.now() - cached.at < MODEL_TTL) return cached.rows;
  try {
    const endpoint = p.kind === "aimlapi" ? `${p.base_url.replace(/\/$/, "")}/models?include=pricing` : `${p.base_url.replace(/\/$/, "")}/models`;
    const res = await sdkFetch(endpoint, { method: "GET", headers: p.key_sealed ? { authorization: `Bearer ${unseal(p.key_sealed)}` } : {}, signal: AbortSignal.timeout(20_000), maxResponseBytes: 4 * 1024 * 1024 } as RequestInit);
    if (!res.ok) { await res.body?.cancel(); throw new ProviderError("The provider could not return its model list."); }
    const payload: unknown = await res.json();
    const raw: unknown[] = Array.isArray(payload) ? payload : (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : []);
    const usdRate = Number(process.env.IZWI_USD_ZAR);
    const rateDate = process.env.IZWI_USD_ZAR_ASOF;
    const rows = raw.flatMap((item): ListedModel[] => {
      if (!item || typeof item !== "object") return [];
      const v = item as Record<string, unknown>;
      if (typeof v.id !== "string" || !/^[\w./:-]{1,160}$/.test(v.id)) return [];
      const info = v.info && typeof v.info === "object" ? v.info as Record<string, unknown> : {};
      const pricing = v.pricing && typeof v.pricing === "object" ? v.pricing as Record<string, unknown> : {};
      const promptPrice = pricing.prompt === null || pricing.prompt === undefined || pricing.prompt === "" ? Number.NaN : Number(pricing.prompt);
      const completionPrice = pricing.completion === null || pricing.completion === undefined || pricing.completion === "" ? Number.NaN : Number(pricing.completion);
      const live = Number.isFinite(promptPrice) && promptPrice >= 0 && Number.isFinite(completionPrice) && completionPrice >= 0
        ? { input: promptPrice, output: completionPrice } : null;
      if (live) livePrices.set(livePriceKey(v.id, p), { in: live.input, out: live.output, at: Date.now() });
      const table = PRICE_PER_MTOK[v.id];
      const input = live ? live.input : table ? table.in / 1_000_000 : undefined;
      const output = live ? live.output : table ? table.out / 1_000_000 : undefined;
      // Local (private) providers run on this machine, so they cost nothing; this matches priceFor in budget.ts.
      const free = privacyOf(p) === "private" || !!p.free_tier || v.id.endsWith(":free") || (input === 0 && output === 0);
      let costTag: ListedModel["costTag"] = "Unknown", estUsdPerTurn: number | undefined;
      if (free) costTag = "Free";
      else if (input !== undefined && output !== undefined) {
        estUsdPerTurn = (1500 * input + 400 * output);
        const rate = Number.isFinite(usdRate) && usdRate > 0 ? usdRate : undefined;
        if (rate !== undefined) {
          const rands = estUsdPerTurn * rate;
          costTag = rands < 0.01 ? "Cheap" : rands < 0.1 ? "Moderate" : "Expensive";
        }
      }
      const result: ListedModel = { id: v.id, label: typeof v.name === "string" ? v.name : typeof info.name === "string" ? info.name : v.id, costTag };
      const context = Number(v.context_length ?? v.context_window ?? info.contextLength);
      if (Number.isSafeInteger(context) && context > 0) result.contextTokens = context;
      if (estUsdPerTurn !== undefined) {
        if (Number.isFinite(usdRate) && usdRate > 0 && rateDate) { result.estRandPerTurn = Math.round(estUsdPerTurn * usdRate * 100_000) / 100_000; result.rateAsOf = rateDate; }
        else result.estUsdPerTurn = Math.round(estUsdPerTurn * 100_000) / 100_000;
        result.priceSource = live ? `${p.base_url.replace(/\/$/, "")}/models` : table?.source;
      }
      return [result];
    }).sort((a, b) => {
      const order = (x: ListedModel) => x.costTag === "Free" ? 0 : x.estRandPerTurn ?? x.estUsdPerTurn ?? Number.POSITIVE_INFINITY;
      return order(a) - order(b) || (a.contextTokens ?? Number.POSITIVE_INFINITY) - (b.contextTokens ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id);
    });
    modelCache.set(p.id, { at: Date.now(), rows });
    return rows;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("Could not load models from this provider.", true);
  }
}

export function providerFor(workspaceId: string, role: Role): ProviderRow | undefined {
  const routed = one<{ provider_id: string; model: string }>(`SELECT provider_id, model FROM model_route WHERE workspace_id = ? AND role = ?`, workspaceId, role);
  if (routed) {
    const provider = one<ProviderRow>(`SELECT * FROM provider WHERE id = ? AND workspace_id = ? AND last_test_ok = 1`, routed.provider_id, workspaceId);
    return provider ? { ...provider, model: routed.model } : undefined;
  }
  return all<ProviderRow>(`SELECT * FROM provider WHERE workspace_id = ? ORDER BY created_at`, workspaceId).find(
    (p) => parse<string[]>(p.roles, []).includes(role) && p.last_test_ok === 1,
  );
}

// Early feedback when a provider is saved. The real check is in guardedFetch, at connect time, after DNS.
// Cloud metadata addresses are always refused; private ranges are refused when IZWI_HOSTED=1
// (a local install needs localhost for Ollama).
export function checkBaseUrl(raw: string, kind?: ProviderKind): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ProviderError("That address is not a valid URL.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new ProviderError("Only http and https addresses are allowed.");
  if (u.username || u.password) throw new ProviderError("Put the key in the key field, not in the address.");
  if (u.search || u.hash) throw new ProviderError("Leave out the ? and # parts of the address.");
  if (kind === "ollama" && (u.protocol !== "http:" || !loopback(u.hostname))) throw new ProviderError("Ollama must use an http loopback address on this machine.");
  if (kind && Object.hasOwn(PROVIDER_PRESETS, kind)) return PROVIDER_PRESETS[kind as keyof typeof PROVIDER_PRESETS].baseUrl;
  if (kind !== "ollama" && u.protocol !== "https:") throw new ProviderError("External providers must use https.");
  const h = u.hostname;
  if (/^169\.254\./.test(h) || h === "metadata.google.internal" || h === "[fd00:ec2::254]") throw new ProviderError("That address is not allowed.");
  if (process.env.IZWI_HOSTED === "1" && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(h)) throw new ProviderError("Private addresses are not allowed on a hosted install.");
  return u.toString().replace(/\/$/, "");
}

// The key is unsealed here, inside the request that needs it, and never stored decrypted.
const authHeader = (p: ProviderRow): Record<string, string> => (p.key_sealed ? { authorization: `Bearer ${unseal(p.key_sealed)}` } : {});
const endpoint = (p: ProviderRow, path: string) => `${p.base_url.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

// Fixed messages only: the upstream body is never shown, because it can echo the request, the key or internal detail.
const STATUS_HINT: Record<number, string> = {
  400: "refused the request. Check the model name.",
  401: "refused the key.",
  403: "refused the key.",
  404: "has no such address or model.",
  413: "said the request is too large.",
  429: "is rate-limiting this key. Try again in a minute.",
};
export function statusError(p: ProviderRow, status: number) {
  const hint = STATUS_HINT[status] ?? (status >= 500 ? "had a problem on its side." : `answered ${status}.`);
  return new ProviderError(`${p.label} ${hint}`, status === 429 || status >= 500);
}

async function call(p: ProviderRow, url: string, init: GuardedInit): Promise<{ response: Response; receipt: ReturnType<typeof reserveTrialCall> }> {
  try {
    const receipt = reserveTrialCall(p, url);
    const headers = { ...init.headers, ...(p.kind === "openrouter" ? { "HTTP-Referer": PUBLIC_URL, "X-Title": "IZWI AI" } : {}) };
    const body = init.body instanceof Uint8Array
      ? init.body.buffer.slice(init.body.byteOffset, init.body.byteOffset + init.body.byteLength) as ArrayBuffer
      : init.body;
    return { response: await sdkFetch(url, { method: init.method, headers, body, signal: init.signal }), receipt };
  } catch (e) {
    if (e instanceof TrialPolicyError) throw new ProviderError(e.message);
    if (e instanceof BlockedAddressError) throw new ProviderError(`${p.label}: that address is not allowed.`);
    throw new ProviderError(`Could not reach ${p.label}.`, true);
  }
}

export async function chatJSON<T>(p: ProviderRow, system: string, user: string, schema: z.ZodType<T>, o: { maxTokens?: number; timeoutMs?: number } = {}) {
  if (!p.model) throw new ProviderError(`${p.label} has no model name. Add one in Run on.`);
  if (trialEnabled() && Buffer.byteLength(system) + Buffer.byteLength(user) > 12_000) {
    throw new ProviderError("The hosted trial accepts up to 12 KB of text per request.");
  }
  const maxTokens = trialEnabled() ? Math.min(o.maxTokens ?? 1000, 1000) : o.maxTokens ?? 2000;
  const send = (jsonMode: boolean) =>
    call(p, endpoint(p, "chat/completions"), {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader(p) },
      body: JSON.stringify({
        model: p.model, temperature: 0.2, max_tokens: maxTokens, ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 120_000),
    });
  let { response: res, receipt } = await send(true);
  // Some models refuse response_format with a 400. The prompt already asks for JSON, so try once without it.
  if (res.status === 400 && !trialEnabled()) {
    await res.body?.cancel();
    ({ response: res, receipt } = await send(false));
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw statusError(p, res.status);
  }
  const d = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  recordTrialTokens(receipt, d.usage?.prompt_tokens, d.usage?.completion_tokens);
  const text = d.choices?.[0]?.message?.content ?? "";
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new ProviderError("The model did not return JSON.", true);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(a, b + 1));
  } catch {
    throw new ProviderError("The model returned broken JSON.", true);
  }
  const r = schema.safeParse(parsed);
  if (!r.success) throw new ProviderError("The model's answer did not have the expected shape.", true);
  return { data: r.data, usage: { input: d.usage?.prompt_tokens ?? 0, output: d.usage?.completion_tokens ?? 0 } };
}

async function madlad(p: ProviderRow, text: string, lang: string) {
  const { response: res } = await call(p, p.base_url, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeader(p) },
    body: JSON.stringify({ inputs: `<2${lang}> ${text}` }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw statusError(p, res.status);
  const d = (await res.json()) as { generated_text?: string }[] | { generated_text?: string };
  const out = Array.isArray(d) ? d[0]?.generated_text : d.generated_text;
  if (!out) throw new ProviderError("The translation endpoint returned no text.", true);
  return out.trim();
}

export async function testProvider(p: ProviderRow): Promise<{ ok: boolean; note: string }> {
  try {
    if (["openrouter", "ollama", "meta", "groq", "gemini", "aimlapi"].includes(p.kind) || parse<string[]>(p.roles, []).includes("chat")) {
      if (!p.model) throw new ProviderError(`${p.label} has no model name. Add one in Run on.`);
      const headers = { "content-type": "application/json", ...authHeader(p) };
      const { response } = await call(p, endpoint(p, "chat/completions"), {
        method: "POST", headers,
        body: JSON.stringify({ model: p.model, messages: [{ role: "user", content: "Hi" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(60_000),
      });
      await response.body?.cancel();
      if (!response.ok) throw statusError(p, response.status);
      return { ok: true, note: `${p.model} answered a chat test request.` };
    }
    if (p.kind === "openai_compat") {
      const r = await chatJSON(p, "Reply with JSON only.", 'Return exactly {"ok":true}.', z.object({ ok: z.boolean() }), { maxTokens: 20, timeoutMs: 60_000 });
      return { ok: r.data.ok, note: `${p.model} answered a test request.` };
    }
    if (p.kind === "madlad_endpoint") {
      const t = await madlad(p, "Good morning", "zu");
      return { ok: true, note: `Translated a test phrase (“${t.slice(0, 40)}”).` };
    }
    const { response: res } = await call(p, p.base_url, { method: "GET", headers: authHeader(p), signal: AbortSignal.timeout(20_000) });
    await res.body?.cancel();
    return { ok: res.status < 500, note: `Endpoint answered ${res.status}.` };
  } catch (e) {
    return { ok: false, note: e instanceof ProviderError ? e.message : "The test did not finish." };
  }
}

const TranslationOut = z.object({ lines: z.array(z.object({ i: z.number().int(), t: z.string() })) });

// Translate caption lines in batches. Lines keep their timing; only text changes. Suspicious lines get a flag.
export async function translateLines(p: ProviderRow, lines: { i: number; t: string }[], target: { code: string; name: string }, keep: string[]) {
  const result = new Map<number, string>();
  const flags = new Map<number, string>();
  let input = 0, output = 0;
  if (p.kind === "madlad_endpoint") {
    for (const l of lines) result.set(l.i, await madlad(p, l.t, target.code));
  } else {
    const system = [
      `You translate video captions into ${target.name} (${target.code}).`,
      `Keep these words exactly as written: ${keep.length ? keep.join(", ") : "(none)"}.`,
      "Keep people's names. Use short, natural, spoken language. Do not add notes.",
      'Return JSON only: {"lines":[{"i":number,"t":string}]} with every i from the input exactly once.',
    ].join(" ");
    for (let k = 0; k < lines.length; k += 30) {
      const batch = lines.slice(k, k + 30);
      const r = await chatJSON(p, system, JSON.stringify({ lines: batch }), TranslationOut, { maxTokens: 4000, timeoutMs: 180_000 });
      input += r.usage.input;
      output += r.usage.output;
      for (const l of r.data.lines) if (batch.some((b) => b.i === l.i)) result.set(l.i, l.t.trim());
    }
  }
  for (const l of lines) {
    const t = result.get(l.i);
    if (!t) {
      result.set(l.i, l.t);
      flags.set(l.i, "Not translated: kept the original line.");
      continue;
    }
    const ratio = t.length / Math.max(1, l.t.length);
    if (ratio < 0.35 || ratio > 3) flags.set(l.i, "Length looks wrong for a translation. Check this line.");
    for (const k of keep) if (l.t.includes(k) && !t.includes(k)) flags.set(l.i, `“${k}” should stay as written.`);
  }
  return { result, flags, usage: { input, output } };
}

export async function transcribeEndpoint(p: ProviderRow, wav: Buffer) {
  const { response: res } = await call(p, p.base_url, { method: "POST", headers: { "content-type": "audio/wav", ...authHeader(p) }, body: new Uint8Array(wav), signal: AbortSignal.timeout(600_000) });
  if (!res.ok) throw statusError(p, res.status);
  const d = (await res.json()) as { text?: string; chunks?: { timestamp: [number, number]; text: string }[] };
  if (!d.text) throw new ProviderError("The speech endpoint returned no text.", true);
  return d;
}
