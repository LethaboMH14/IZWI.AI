// Guest-facing strings for the consent page. English is complete. isiZulu and Setswana are drafts that stay hidden
// until a team member checks them and sets `reviewed: true`. Nothing here is machine-translated for display.
// `{name}` marks a value filled in at run time; `**text**` marks bold.

const en = {
  topLabel: "Permission request",
  headline: "{creator} is asking for your permission",
  introRole: "You are **{person}**, listed as **{role}**. Nothing happens until you answer, and you can say no.",
  intro: "You are **{person}**. Nothing happens until you answer, and you can say no.",
  whatTitle: "What you are agreeing to",
  whatLead: "{what} in this recording may be:",
  scopeAppearance: "Your appearance, voice and words",
  scopeVoice: "Your voice",
  scopeLikeness: "Your face and likeness",
  scopeUnknown: "What the statement below describes",
  useClips: "cut into clips",
  useCaptioned: "captioned or translated",
  usePublished: "published by the creator",
  withdrawNote: "**If you withdraw later:** anything already published stays published.",
  statementLabel: "Exact recorded statement",
  statementNote: "The statement below is in English. The English statement is what is recorded when you answer.",
  answerTitle: "Your answer",
  statusRequested: "Waiting for your answer",
  statusGranted: "You said yes",
  statusDeclined: "You said no",
  statusRevoked: "You withdrew your yes",
  doneGranted: "You said yes.",
  doneDeclined: "You said no.",
  doneRevoked: "You withdrew your yes.",
  recordedAs: "Recorded as **{by}** on {when}.",
  afterRevoke: "Clips that were already published stay published. Anything not yet published is held.",
  afterGrant: "You can withdraw this later using this same link.",
  afterDecline: "{creator} has been told.",
  answeredBy: "{answer} as **{by}** on {when}.",
  answeredOn: "{answer} on {when}.",
  nameLabel: "Type your name to answer, yes or no",
  nameHint: "Type: **{person}**",
  nameError: "Type your name as shown above: {person}",
  linkStopped: "This link has just stopped working. Ask the creator for a new one.",
  sendFailed: "That did not go through. Try again.",
  sending: "Sending…",
  yes: "Yes, I agree",
  no: "No",
  withdraw: "Withdraw my yes",
  seeWhere: "See where you appear",
  whereTitle: "Where you appear",
  noPreview: "There is no preview to watch yet. You can ask {creator} to show you before you answer.",
  wholeRecording: "{creator} says you appear in **the whole recording**. Watch as much as you like.",
  part: "Part {n}",
  range: "{start} to {end}",
  notMarked: "{creator} has not marked where you appear yet. Ask them before you answer.",
  recordsNote: "**What IZWI records:** the name you type, the time you answer, and the kind of browser you used. It is kept with this project so {creator} can show you agreed.",
  legalNote: "This is a record of your answer, not a legal contract and not legal advice. If you are unsure, ask {creator} or someone you trust before you answer.",
  languageLabel: "Language",
  writtenBy: "Written by Team Sonar",
} as const;

export type ConsentKey = keyof typeof en;
export type ConsentStrings = Record<ConsentKey, string>;
export type ConsentLang = "en" | "zu" | "tn";
type Draft = { reviewed: boolean } & Partial<ConsentStrings>;

// Drafts are left empty on purpose: the team writes and checks them in docs/CONSENT-STRINGS.md, then fills them in here.
const zu: Draft = { reviewed: false };
const tn: Draft = { reviewed: false };

export const LANGUAGES: { id: ConsentLang; name: string }[] = [
  { id: "en", name: "English" },
  { id: "zu", name: "isiZulu" },
  { id: "tn", name: "Setswana" },
];

/** The recorded statement is always English, whatever language the page is shown in. */
export const STATEMENT_LANG = "en" as const;

const BY_LANG: Record<ConsentLang, { reviewed: boolean } & Partial<ConsentStrings>> = { en: { reviewed: true, ...en }, zu, tn };

export const CONSENT_KEYS = Object.keys(en) as ConsentKey[];
export const ENGLISH: ConsentStrings = en;

export function missingKeys(lang: ConsentLang): ConsentKey[] {
  return CONSENT_KEYS.filter((k) => !BY_LANG[lang][k]);
}

/** Languages the switcher may offer: reviewed, and complete. A reviewed language with a gap is an error, not a fallback. */
export function availableLanguages(): { id: ConsentLang; name: string }[] {
  return LANGUAGES.filter((l) => {
    if (!BY_LANG[l.id].reviewed) return false;
    const m = missingKeys(l.id);
    if (m.length) throw new Error(`Consent language ${l.id} is marked reviewed but is missing: ${m.join(", ")}`);
    return true;
  });
}

export function consentStrings(lang: ConsentLang): ConsentStrings {
  if (!availableLanguages().some((l) => l.id === lang)) throw new Error(`Consent language ${lang} is not reviewed.`);
  return BY_LANG[lang] as ConsentStrings;
}

/** Fill `{name}` placeholders. A placeholder with no value throws rather than printing "undefined". */
export function fill(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`Missing value for {${k}} in: ${text}`);
    return String(vars[k]);
  });
}

/** Split filled text on `**bold**` markers. Returns segments in order. */
export function segments(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((s) => (s.startsWith("**") && s.endsWith("**") && s.length > 4 ? { text: s.slice(2, -2), bold: true } : { text: s, bold: false }));
}
