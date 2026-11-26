import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listProviderModels, type ProviderRow } from "../src/server/providers";
import { seal } from "../src/server/crypto";
import { priceFor } from "../src/server/budget";

const key = "sim_model_picker_key_not_real";
async function fake(payload: unknown) {
  let seenAuth = "";
  const server = http.createServer((req, res) => {
    seenAuth = req.headers.authorization ?? "";
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(payload));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fake server port");
  const p: ProviderRow = { id: `fake_${address.port}`, workspace_id: "ws", kind: "openrouter", label: "Fake", base_url: `http://127.0.0.1:${address.port}/v1`, model: null, key_sealed: seal(key), key_hint: "…real", roles: '["chat"]', free_tier: 0, last_test_at: null, last_test_ok: null, last_test_note: null, created_by: "u", created_at: 1 };
  return { server, p, auth: () => seenAuth };
}
afterEach(() => vi.unstubAllEnvs());

describe("live model pricing and key handling", () => {
  it("parses OpenRouter live prices, sorts cheapest first, and never returns or logs the key", async () => {
    vi.stubEnv("IZWI_MASTER_KEY", Buffer.alloc(32, 7).toString("base64url"));
    const logs: string[] = [];
    const logSpies = (["log", "info", "warn", "error"] as const).map(level => vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(" ")); }));
    const upstream = await fake({ data: [
      { id: "paid", name: "Paid model", context_length: 8000, pricing: { prompt: "0.000002", completion: "0.000004" } },
      { id: "free", name: "Free model", context_length: 4000, pricing: { prompt: "0", completion: "0" } },
      { id: "variable", name: "Variable model", pricing: { prompt: null, completion: null } },
      { id: "unknown", name: "Unknown model", context_length: 2000 },
    ] });
    try {
      const models = await listProviderModels(upstream.p);
      expect(upstream.auth()).toBe(`Bearer ${key}`);
      expect(models.map(m => m.id)).toEqual(["free", "paid", "unknown", "variable"]);
      expect(models.map(m => m.costTag)).toEqual(["Free", "Unknown", "Unknown", "Unknown"]);
      vi.stubEnv("IZWI_USD_ZAR", "18.5");
      expect(priceFor("paid", upstream.p)).toEqual({ in: 3700, out: 7400 });
      expect(priceFor("paid", { kind: "openrouter", base_url: "https://another-provider/v1" })).toBeNull();
      expect(JSON.stringify(models)).not.toContain(key);
      expect(logs.join("\n")).not.toContain(key);
    } finally { await new Promise<void>(resolve => upstream.server.close(() => resolve())); for (const spy of logSpies) spy.mockRestore(); }
  });

  it("accepts a plain OpenAI-style list and leaves unsupported pricing unknown", async () => {
    vi.stubEnv("IZWI_MASTER_KEY", Buffer.alloc(32, 9).toString("base64url"));
    const upstream = await fake({ object: "list", data: [{ id: "plain-1", object: "model", context_window: 1234 }] });
    try { expect(await listProviderModels(upstream.p)).toMatchObject([{ id: "plain-1", contextTokens: 1234, costTag: "Unknown" }]); }
    finally { await new Promise<void>(resolve => upstream.server.close(() => resolve())); }
  });

  it("tags local Ollama models as Free, matching the budget (found in the browser check)", async () => {
    vi.stubEnv("IZWI_MASTER_KEY", Buffer.alloc(32, 7).toString("base64url"));
    const upstream = await fake({ object: "list", data: [{ id: "qwen3:1.7b", object: "model" }] });
    try {
      const local: ProviderRow = { ...upstream.p, kind: "ollama", key_sealed: null };
      expect(await listProviderModels(local)).toMatchObject([{ id: "qwen3:1.7b", costTag: "Free" }]);
      expect(priceFor("qwen3:1.7b", local)).toEqual({ in: 0, out: 0 });
    } finally { await new Promise<void>(resolve => upstream.server.close(() => resolve())); }
  });
});
