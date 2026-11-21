// One source for consent scope wording, shared by Protect and the guest consent page.
// `what` matches consentStatement() in src/server/rights.ts, so the record and the screens say the same thing.
export const CONSENT_SCOPES = {
  appearance: { label: "Appearance, voice and words", what: "Your appearance, voice and words" },
  voice: { label: "Voice only", what: "Your voice" },
  likeness: { label: "Face and likeness", what: "Your face and likeness" },
} as const;

export type ConsentScopeId = keyof typeof CONSENT_SCOPES;

/** The uses every scope allows, as written in the recorded statement. */
export const CONSENT_USES = ["cut into clips", "captioned or translated", "published by the creator"] as const;

/** Never widen an unknown scope: show it as unknown rather than guessing the broadest one. */
export function consentScope(scope: string): { label: string; what: string } {
  return CONSENT_SCOPES[scope as ConsentScopeId] ?? { label: `Unknown scope (${scope})`, what: "What the statement below describes" };
}
