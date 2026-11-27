// Sample data for the design mockups only. Fictional episode and people; nothing here is measured.

export const EPISODE = { show: "Jozi Stories", title: "Episode 04", durationMs: 28 * 60_000 + 16_000 };

export type Pillar = { id: string; name: string; color: string; line: string; body: string; chip: string; planned?: boolean };

export const PILLARS: Pillar[] = [
  { id: "create", name: "Create", color: "#B77913", line: "One episode becomes many clips.", body: "IZWI listens to the whole recording and suggests clips, each with the reason it was picked. You keep, trim or drop them.", chip: "3 clips suggested" },
  { id: "localise", name: "Localise", color: "#C4552D", line: "Captions in the languages your audience speaks.", body: "isiZulu, Sesotho, Afrikaans and English drafts. A draft stays a draft until a person approves every line.", chip: "isiZulu · draft" },
  { id: "protect", name: "Protect", color: "#4F6B3A", line: "A record of who agreed to what.", body: "Guests consent on their own phone. A clip without their yes stays held, and the map shows why.", chip: "1 consent outstanding" },
  { id: "publish", name: "Publish", color: "#E9A21B", line: "Ready for TikTok, Reels, Shorts and WhatsApp.", body: "9:16, 1:1 and 16:9 renders with burned-in captions, plus Content Credentials that travel with the file.", chip: "2 renders ready" },
  { id: "earn", name: "Earn", color: "#8A5A0B", line: "License your stories.", body: "A public licence page where brands and broadcasters can enquire about your work.", chip: "Planned", planned: true },
];

// A speech-like envelope: bursts of words with short pauses. Deterministic, so screenshots match.
// The real build uses the episode's own waveform peaks from the worker.
export function samplePeaks(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const words = Math.abs(Math.sin(t * 61.3) * Math.sin(t * 17.9 + 1.1));
    const phrase = 0.55 + 0.45 * Math.sin(t * Math.PI * 9 + 0.4);
    const grain = 0.5 + 0.5 * Math.sin(i * 12.9898) * Math.sin(i * 4.1414);
    out.push(Math.max(0.08, Math.min(1, 0.15 + words * phrase * 0.75 + grain * 0.18)));
  }
  return out;
}

export type ClipStatus = "held" | "draft" | "ready";
export type Person = { id: string; name: string; role: string; consent: "declared" | "yes" | "waiting" };
export type Output = { id: string; label: string; status: ClipStatus; note: string };
export type Clip = { id: string; title: string; startMs: number; endMs: number; people: string[]; outputs: Output[] };

export const PEOPLE: Person[] = [
  { id: "naledi", name: "Naledi M.", role: "Host · creator declaration", consent: "declared" },
  { id: "sipho", name: "Sipho D.", role: "Guest", consent: "waiting" },
  { id: "lerato", name: "Lerato K.", role: "Caller", consent: "yes" },
];

export const CLIPS: Clip[] = [
  { id: "c1", title: "Start before you are ready", startMs: 3 * 60_000 + 12_000, endMs: 3 * 60_000 + 58_000, people: ["naledi"], outputs: [
    { id: "o1", label: "9:16 · English", status: "ready", note: "Ready" },
    { id: "o2", label: "1:1 · English", status: "ready", note: "Ready" },
  ] },
  { id: "c2", title: "Why Soweto taught me to sell", startMs: 12 * 60_000 + 4_000, endMs: 12 * 60_000 + 51_000, people: ["naledi", "sipho"], outputs: [
    { id: "o3", label: "9:16 · English", status: "held", note: "Waiting on Sipho" },
    { id: "o4", label: "9:16 · isiZulu", status: "held", note: "Waiting on Sipho" },
  ] },
  { id: "c3", title: "The caller who changed my mind", startMs: 21 * 60_000 + 30_000, endMs: 22 * 60_000 + 14_000, people: ["naledi", "lerato"], outputs: [
    { id: "o5", label: "9:16 · isiZulu", status: "draft", note: "Captions draft · 6 of 11 lines" },
  ] },
];

export const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Status of a clip: held if anyone in it hasn't said yes, else the weakest output status. */
export function clipStatus(c: Clip, people: Person[]): ClipStatus {
  if (c.people.some((p) => people.find((x) => x.id === p)?.consent === "waiting")) return "held";
  return c.outputs.some((o) => o.status === "draft") ? "draft" : "ready";
}

export const STATUS_COLOR: Record<ClipStatus, string> = { held: "#C4552D", draft: "#E9A21B", ready: "#4F6B3A" };
export const STATUS_WORD: Record<ClipStatus, string> = { held: "Held", draft: "Draft", ready: "Ready" };
