import { describe, expect, it } from "vitest";
import { POLICY_RULES, policyPrecheck } from "../src/lib/platform-policy";

describe("limited platform policy pre-check", () => {
  it("returns Review with sourced findings when context is unknown", () => {
    const result = policyPrecheck({ platform: "youtube", durationMs: 60_000, preset: "vertical", captionsApproved: null, rightsDeclared: null, consentKnown: false });
    expect(result.status).toBe("review");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((finding) => finding.sourceUrl.startsWith("https://") && finding.checkedAt === "2026-11-28")).toBe(true);
  });
  it("blocks a TikTok developer upload above ten minutes and never returns a safety guarantee", () => {
    const result = policyPrecheck({ platform: "tiktok", durationMs: 601_000, preset: "vertical", captionsApproved: true, rightsDeclared: true, consentKnown: true });
    expect(result.status).toBe("block");
    expect(result.scope).toBe("limited pre-check");
    expect(POLICY_RULES.tiktok.sourceUrl).toContain("developers.tiktok.com");
  });
});
