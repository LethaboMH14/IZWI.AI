export type PolicyPlatform = "youtube" | "tiktok" | "instagram" | "facebook";
export type PolicyFinding = { rule: string; sourceUrl: string; checkedAt: string; field: string; result: "review" | "block"; explanation: string };
export type PolicyResult = { platform: PolicyPlatform; status: "pass" | "review" | "block"; findings: PolicyFinding[]; checkedAt: string; scope: "limited pre-check" };

export const POLICY_RULES: Record<PolicyPlatform, { sourceUrl: string; checkedAt: string }> = {
  youtube: { sourceUrl: "https://support.google.com/youtube/answer/9288567?hl=en", checkedAt: "2026-11-28" },
  tiktok: { sourceUrl: "https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide", checkedAt: "2026-11-28" },
  instagram: { sourceUrl: "https://transparency.meta.com/policies/community-standards/", checkedAt: "2026-11-28" },
  facebook: { sourceUrl: "https://transparency.meta.com/policies/community-standards/", checkedAt: "2026-11-28" },
};

export function policyPrecheck(input: { platform: PolicyPlatform; durationMs: number; preset: string; captionsApproved: boolean | null; rightsDeclared: boolean | null; consentKnown: boolean }): PolicyResult {
  const { platform } = input;
  const rule = POLICY_RULES[platform];
  const checkedAt = new Date().toISOString();
  const findings: PolicyFinding[] = [];
  const review = (field: string, ruleName: string, explanation: string, sourceUrl = rule.sourceUrl) => findings.push({ rule: ruleName, sourceUrl, checkedAt: rule.checkedAt, field, result: "review", explanation });
  const block = (field: string, ruleName: string, explanation: string) => findings.push({ rule: ruleName, sourceUrl: rule.sourceUrl, checkedAt: rule.checkedAt, field, result: "block", explanation });
  if (input.captionsApproved === null) review("captions", "Review captions and transcript", "IZWI has no reviewed transcript/caption evidence for this render.");
  if (input.captionsApproved === false) review("captions", "Caption quality is not verified", "Check the transcript and captions before sharing.");
  if (input.rightsDeclared !== true) review("music and rights declaration", "Confirm music and content rights", "Rights status is missing or not confirmed in this pre-check.");
  if (!input.consentKnown) review("people consent", "Confirm people consent", "IZWI cannot verify everyone shown or heard in this render.");
  review("title, description and tags", "Review metadata", "Platform-specific title, description and tags are not part of this render pre-check.");
  review("thumbnail text", "Review thumbnail text", "Thumbnail text is not inspected by this pre-check.");
  review("AI disclosure", "Review altered or synthetic content disclosure", "Creator must decide whether platform disclosure applies.", platform === "youtube" ? "https://support.google.com/youtube/answer/14328491?hl=en" : rule.sourceUrl);
  review("age-sensitive topics and spam", "Review sensitive topics and metadata", "No classifier has reviewed sensitive-topic or misleading-metadata context.");
  if (platform === "tiktok" && input.durationMs > 10 * 60_000) block("duration", "TikTok developer upload duration", "The current Content Posting API guide caps developer uploads at 10 minutes.");
  if (platform === "tiktok" && !["vertical", "square", "wide"].includes(input.preset)) review("aspect ratio", "Confirm media constraints", "This output preset is not in the supported preset set used by IZWI.");
  return { platform, status: findings.some((f) => f.result === "block") ? "block" : findings.length ? "review" : "pass", findings, checkedAt, scope: "limited pre-check" };
}
