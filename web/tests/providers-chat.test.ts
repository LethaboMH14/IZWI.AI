import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkBaseUrl, privacyOf, testProvider, type ProviderRow } from "../src/server/providers";

describe("chat provider policy", () => {
  let server: http.Server;
  let port = 0;
  let received: { headers: http.IncomingHttpHeaders; body: string } | undefined;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const data: Buffer[] = [];
      req.on("data", (chunk: Buffer) => data.push(chunk));
      req.on("end", () => {
        received = { headers: req.headers, body: Buffer.concat(data).toString() };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const provider = (overrides: Partial<ProviderRow>): ProviderRow => ({
    id: "p", workspace_id: "w", kind: "openrouter", label: "Test", base_url: `http://127.0.0.1:${port}/v1`, model: "demo:free",
    key_sealed: null, key_hint: null, roles: '["chat"]', last_test_at: null, last_test_ok: null,
    last_test_note: null, created_by: "u", created_at: 0, ...overrides,
  });

  it("derives privacy classes and applies safe URL requirements", () => {
    expect(privacyOf(provider({ kind: "ollama", base_url: "http://127.0.0.1:11434/v1" }))).toBe("private");
    expect(privacyOf(provider({ kind: "ollama", base_url: "http://192.168.1.4:11434/v1" }))).toBe("may_log");
    expect(privacyOf(provider({ kind: "openrouter", base_url: "https://openrouter.ai/api/v1" }))).toBe("may_log");
    expect(privacyOf(provider({ kind: "meta", base_url: "https://api.meta.ai/v1" }))).toBe("standard");
    expect(checkBaseUrl("https://other.example/v1", "openrouter")).toBe("https://openrouter.ai/api/v1");
    expect(() => checkBaseUrl("http://external.example/v1", "openai_compat")).toThrow(/https/);
    expect(() => checkBaseUrl("http://192.168.1.4:11434/v1", "ollama")).toThrow(/loopback/);
  });

  it("sends a minimal one-token chat completion through sdkFetch with OpenRouter headers", async () => {
    const result = await testProvider(provider({ base_url: `http://127.0.0.1:${port}/v1` }));
    expect(result.ok).toBe(true);
    expect(JSON.parse(received!.body)).toMatchObject({ model: "demo:free", max_tokens: 1, messages: [{ role: "user", content: "Hi" }] });
    expect(received!.headers["http-referer"]).toBeTruthy();
    expect(received!.headers["x-title"]).toBe("IZWI AI");
  });
});
