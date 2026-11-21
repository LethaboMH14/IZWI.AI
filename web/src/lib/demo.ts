// Sample content for the design prototype. Every figure and line on screen comes from this file.
// Nothing here is model output, a measured result or a real customer record.

export type Lang = "en" | "zu" | "st" | "mix";

export const langName: Record<Lang, string> = {
  en: "English",
  zu: "isiZulu",
  st: "Sesotho",
  mix: "Mzansi slang",
};

export const project = {
  show: "Jozi Stories",
  title: "Episode 04",
  duration: "28:16",
  durationSec: 1696,
  host: "Naledi",
  uploadSize: "1.2 GB",
  proxySize: "86 MB",
  saved: "Saved 2 min ago",
};

// Source captions keep code-switching exactly as spoken. Each word carries its language.
export type Word = { t: string; l: Lang; flag?: "name" | "idiom" };
export type Line = { id: string; at: string; words: Word[]; en: string; zu: string; note?: string };

const w = (s: string, l: Lang = "en"): Word[] => s.split(" ").map((t) => ({ t, l }));

export const lines: Line[] = [
  {
    id: "l1",
    at: "00:04",
    words: [{ t: "Sawubona", l: "zu" }, { t: "Mzansi,", l: "mix", flag: "name" }, ...w("welcome back to"), { t: "Jozi", l: "mix", flag: "name" }, { t: "Stories.", l: "en", flag: "name" }],
    en: "Hello South Africa, welcome back to Jozi Stories.",
    zu: "Sawubona Mzansi, siyakwamukela futhi ku-Jozi Stories.",
    note: "Show name stays untranslated. Glossary: Jozi Stories.",
  },
  {
    id: "l2",
    at: "00:09",
    words: [...w("This is a"), { t: "Jozi", l: "mix", flag: "name" }, ...w("story, about the people who make this city sing.")],
    en: "This is a Johannesburg story, about the people who make this city sing.",
    zu: "Lena yindaba yaseGoli, ngabantu abenza leli dolobha licule.",
    note: "“Make this city sing” is an idiom. Check it reads naturally.",
  },
  {
    id: "l3",
    at: "00:18",
    words: [{ t: "Eish,", l: "mix", flag: "idiom" }, ...w("we started with one phone and a borrowed mic.")],
    en: "Honestly, we started with one phone and a borrowed mic.",
    zu: "Eish, saqala ngefoni eyodwa nemakrofoni ebolekiwe.",
  },
  {
    id: "l4",
    at: "00:26",
    words: [...w("Every creator has a voice. We tell it in our own languages.")],
    en: "Every creator has a voice. We tell it in our own languages.",
    zu: "Wonke umdali unezwi. Siyixoxa ngezilimi zethu.",
  },
  {
    id: "l5",
    at: "00:34",
    words: [{ t: "Ngiyabonga", l: "zu" }, ...w("for listening."), { t: "Sharp", l: "mix", flag: "idiom" }, { t: "sharp.", l: "mix", flag: "idiom" }],
    en: "Thank you for listening. See you soon.",
    zu: "Siyabonga ngokulalela. Sharp sharp.",
    note: "Sign-off kept as spoken.",
  },
];

export type Clip = { id: string; title: string; in: string; out: string; start: number; end: number; why: string; state: "draft" | "kept" };
export const clips: Clip[] = [
  { id: "c1", title: "One phone and a borrowed mic", in: "00:18", out: "00:46", start: 0.05, end: 0.17, why: "Starts on a full sentence. Ends on a pause, not mid-word.", state: "kept" },
  { id: "c2", title: "Every creator has a voice", in: "04:12", out: "04:51", start: 0.33, end: 0.47, why: "One complete thought with no cross-talk.", state: "draft" },
  { id: "c3", title: "Why we tell it in our languages", in: "11:03", out: "11:40", start: 0.66, end: 0.8, why: "Naledi speaks alone here, so no guest consent is needed for this cut.", state: "draft" },
];

export type Status = "done" | "draft" | "blocked" | "off" | "planned";
export const statusLabel: Record<Status, string> = {
  done: "Reviewed",
  draft: "Draft",
  blocked: "Waiting on someone",
  off: "Not connected",
  planned: "Planned",
};

// The story map: one source, many outputs. Each leaf says honestly where it stands.
export type Leaf = { id: string; clip: string; lang: Lang; format: string; status: Status; dest: string };
export const leaves: Leaf[] = [
  { id: "o1", clip: "c1", lang: "en", format: "9:16", status: "done", dest: "MP4 + SRT ready" },
  { id: "o2", clip: "c1", lang: "zu", format: "9:16", status: "draft", dest: "isiZulu needs a reviewer" },
  { id: "o3", clip: "c1", lang: "en", format: "1:1", status: "done", dest: "MP4 + SRT ready" },
  { id: "o4", clip: "c2", lang: "en", format: "9:16", status: "blocked", dest: "Guest consent requested" },
  { id: "o5", clip: "c2", lang: "zu", format: "9:16", status: "blocked", dest: "Guest consent requested" },
  { id: "o6", clip: "c3", lang: "en", format: "16:9", status: "draft", dest: "Captions not reviewed" },
  { id: "o7", clip: "c3", lang: "st", format: "9:16", status: "planned", dest: "Sesotho not evaluated yet" },
];

export const records = [
  { who: "Naledi M.", role: "Host and owner", what: "Creator declaration", state: "done" as Status, detail: "Recorded 12 Nov. A declaration is your statement, not a verified ownership check." },
  { who: "Thabo K.", role: "Guest, 04:02 to 09:30", what: "Appearance consent", state: "blocked" as Status, detail: "Link sent on WhatsApp 14 Nov. Not opened yet. Clips with Thabo cannot export." },
  { who: "Lerato D.", role: "Editor", what: "Collaboration terms", state: "draft" as Status, detail: "Draft split 80 / 20 on licensing. Not agreed by Lerato yet." },
  { who: "Intro music", role: "Third-party track", what: "Licence reference", state: "draft" as Status, detail: "No licence file attached. Add one or swap the track before publishing." },
];

export const destinations = [
  { name: "Download", detail: "MP4 and SRT to this device", state: "done" as Status },
  { name: "YouTube", detail: "Connect an account to prepare an upload", state: "off" as Status },
  { name: "TikTok", detail: "Connect an account to prepare an upload", state: "off" as Status },
  { name: "WhatsApp Status pack", detail: "30-second cuts, small files", state: "planned" as Status },
];

// Proposed prices from the Team Sonar canvas. Assumptions, not validated.
export const plans = [
  { name: "Free", price: "R0", line: "Local editing, your own model keys, basic exports, limited hosted trials." },
  { name: "Creator", price: "R149", line: "Cloud allowance, exports, workflow automation, supported publishing." },
  { name: "Studio", price: "R499", line: "Collaboration, a larger allowance, shared projects and client workflow." },
  { name: "Agency", price: "R1 499", line: "Multi-client management, the largest allowance, advanced permissions." },
];

export const stages = ["Create", "Localise", "Protect", "Publish", "Earn"] as const;
export type Stage = (typeof stages)[number];

// Deterministic waveform so the picture is identical on every render.
export function waveform(n: number, seed = 7): number[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const phrase = Math.pow(Math.abs(Math.sin(x * 23 + 0.6)), 0.7) * (0.55 + 0.45 * Math.sin(x * 5.1 + 1));
    out.push(Math.max(0.06, Math.min(1, phrase * (0.45 + rnd() * 0.75))));
  }
  return out;
}
