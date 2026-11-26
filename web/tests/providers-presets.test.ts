import { describe, expect, it } from "vitest";
import { canMarkFreeTier, checkBaseUrl, privacyOf, PROVIDER_PRESETS } from "../src/server/providers";

describe("provider presets", () => {
  it("uses fixed documented hosts and rejects attempts to override a preset URL", () => {
    expect(PROVIDER_PRESETS.groq.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(PROVIDER_PRESETS.gemini.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai/");
    expect(PROVIDER_PRESETS.aimlapi.baseUrl).toBe("https://api.aimlapi.com/v1");
    expect(PROVIDER_PRESETS.meta.baseUrl).toBe("https://api.meta.ai/v1");
    expect(PROVIDER_PRESETS.openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(PROVIDER_PRESETS.ollama.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(checkBaseUrl("https://attacker.example/v1", "groq")).toBe(PROVIDER_PRESETS.groq.baseUrl);
  });
  it("derives the promised privacy classes from kind and host", () => {
    expect(privacyOf({ kind: "ollama", base_url: PROVIDER_PRESETS.ollama.baseUrl })).toBe("private");
    expect(privacyOf({ kind: "meta", base_url: PROVIDER_PRESETS.meta.baseUrl })).toBe("standard");
    expect(privacyOf({ kind: "groq", base_url: PROVIDER_PRESETS.groq.baseUrl })).toBe("may_log");
  });
  it("allows only a workspace owner to mark a provider free tier", () => {
    expect(canMarkFreeTier("owner")).toBe(true);
    expect(canMarkFreeTier("admin")).toBe(false);
    expect(canMarkFreeTier("member")).toBe(false);
  });
});
