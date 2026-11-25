// Bring your own model. One adapter for any OpenAI-compatible chat API (AI/ML API, Meta Llama API, Ollama,
// vLLM, LM Studio...), one for a MADLAD-400 translation endpoint, one for a speech endpoint.
// The model proposes; code validates the shape and the rules before anything is saved.
import { z } from "zod";
import { all, parse } from "./db";
import { unseal } from "./crypto";
import { BlockedAddressError, guardedFetch, type GuardedInit } from "./ssrf";
import { recordTrialTokens, reserveTrialCall, TrialPolicyError, trialEnabled } from "./provider-trial";

export type ProviderKind = "openai_compat" | "madlad_endpoint" | "asr_endpoint";
export type ProviderRow = {
  id: string; workspace_id: string; kind: ProviderKind; label: string; base_url: string; model: string | null;
  key_sealed: string | null; key_hint: string | null; roles: string; last_test_at: number | null;
  last_test_ok: number | null; last_test_note: string | null; created_by: string; created_at: number;
};
export type Role = "plan" | "translate" | "clips" | "asr";

export const publicProvider = (p: ProviderRow) => ({
  id: p.id, kind: p.kind, label: p.label, baseUrl: p.base_url, model: p.model, keyHint: p.key_hint, roles: parse<string[]>(p.roles, []),
  lastTestAt: p.last_test_at, lastTestOk: p.last_test_ok === null ? null : p.last_test_ok === 1, lastTestNote: p.last_test_note,
});

export class ProviderError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

export function providerFor(workspaceId: string, role: Role): ProviderRow | undefined {
  return all<ProviderRow>(`SELECT * FROM provider WHERE workspace_id = ? ORDER BY created_at`, workspaceId).find(
    (p) => parse<string[]>(p.roles, []).includes(role) && p.last_test_ok === 1,
  );
}

// Early feedback when a provider is saved. The real check is in guardedFetch, at connect time, after DNS.
// Cloud metadata addresses are always refused; private ranges are refused when IZWI_HOSTED=1
// (a local install needs localhost for Ollama).
export function checkBaseUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ProviderError("That address is not a valid URL.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new ProviderError("Only http and https addresses are allowed.");
  if (u.username || u.password) throw new ProviderError("Put the key in the key field, not in the address.");
  if (u.search || u.hash) throw new ProviderError("Leave out the ? and # parts of the address.");
  const h = u.hostname;
  if (/^169\.254\./.test(h) || h === "metadata.google.internal" || h === "[fd00:ec2::254]") throw new ProviderError("That address is not allowed.");
  if (process.env.IZWI_HOSTED === "1" && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(h)) throw new ProviderError("Private addresses are not allowed on a hosted install.");
  return u.toString().replace(/\/$/, "");
}

// The key is unsealed here, inside the request that needs it, and never stored decrypted.
const authHeader = (p: ProviderRow): Record<string, string> => (p.key_sealed ? { authorization: `Bearer ${unseal(p.key_sealed)}` } : {});

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
    return { response: await guardedFetch(url, init), receipt };
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
    call(p, `${p.base_url}/chat/completions`, {
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
