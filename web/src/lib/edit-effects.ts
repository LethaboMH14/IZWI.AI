// "Effects of this edit": only what the server actually does when a trim is applied (Codex round 1, finding 5).
// - Caption lines are sliced by time at render, so lines that leave or enter the range are listed.
// - Translations are not re-timed; their lines leave or enter the same way, at line level.
// - Consent: the latest recorded answer per person whose appearances overlap the new range; other scopes unknown.
// - Outputs: this clip's ready, unposted renders are marked failed by the server ("render again"); posted ones stay.
import type { ProjectState } from "@/server/state";
import type { Range } from "./proposals";

export type EffectTone = "ok" | "warn" | "unknown";
export type Effect = { id: string; tone: EffectTone; title: string; detail: string };
type Timed = { startMs: number; endMs: number };

const overlaps = (a: Timed, b: Range) => a.endMs > b.startMs && a.startMs < b.endMs;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function lineShift(lines: Timed[], from: Range, to: Range) {
  let leave = 0, enter = 0, stay = 0;
  for (const l of lines) {
    const a = overlaps(l, from), b = overlaps(l, to);
    if (a && !b) leave++;
    else if (!a && b) enter++;
    else if (a && b) stay++;
  }
  return { leave, enter, stay };
}

function shiftDetail(s: { leave: number; enter: number; stay: number }) {
  const parts: string[] = [];
  if (s.leave) parts.push(`${plural(s.leave, "line")} leave${s.leave === 1 ? "s" : ""} the scene`);
  if (s.enter) parts.push(`${plural(s.enter, "line")} join${s.enter === 1 ? "s" : ""}`);
  parts.push(`${plural(s.stay, "line")} stay`);
  return parts.join("; ");
}

export function trimEffects(
  state: ProjectState,
  clipId: string,
  next: Range,
  translations: Record<string, { language: string; lines: Timed[] | null }> = {},
): Effect[] {
  const clip = state.clips.find((c) => c.id === clipId);
  if (!clip) return [{ id: "missing", tone: "unknown", title: "Scene", detail: "This scene no longer exists" }];
  const from: Range = { startMs: clip.startMs, endMs: clip.endMs };
  const effects: Effect[] = [];

  const src = lineShift(state.lines, from, next);
  effects.push({ id: "captions", tone: src.leave || src.enter ? "warn" : "ok", title: "Source captions", detail: shiftDetail(src) });

  for (const [trackId, t] of Object.entries(translations).sort(([a], [b]) => a.localeCompare(b))) {
    if (!t.lines) { effects.push({ id: `tr:${trackId}`, tone: "unknown", title: `${t.language} captions`, detail: "Loading the translated lines" }); continue; }
    const s = lineShift(t.lines, from, next);
    effects.push({ id: `tr:${trackId}`, tone: s.leave || s.enter ? "warn" : "ok", title: `${t.language} captions`, detail: shiftDetail(s) });
  }

  const people = state.people.filter((p) => p.wholeRecording || p.ranges.some((r) => overlaps(r, next)));
  const entering = state.people.filter((p) => !p.wholeRecording && p.ranges.some((r) => overlaps(r, next)) && !p.ranges.some((r) => overlaps(r, from)));
  if (people.length === 0) {
    effects.push({ id: "consent", tone: "unknown", title: "Consent", detail: "No people are marked in this range" });
  } else {
    const words = people.map((p) => (p.consent ? `${p.name} · ${p.consent.scope} · ${p.consent.status[0].toUpperCase()}${p.consent.status.slice(1)}` : `${p.name} · not asked`));
    const allGranted = people.every((p) => p.consent?.status === "granted");
    const tail = entering.length ? `. ${entering.map((p) => p.name).join(", ")} newly in range` : ". No new person enters";
    effects.push({ id: "consent", tone: allGranted && entering.length === 0 ? "ok" : "warn", title: "Consent", detail: words.join("; ") + tail });
  }

  const mine = state.outputs.filter((o) => o.clipId === clipId);
  const stale = mine.filter((o) => o.status === "ready" && !o.posted);
  const posted = mine.filter((o) => !!o.posted);
  const busy = mine.filter((o) => o.status === "queued" || o.status === "running" || o.status === "blocked");
  if (busy.length) effects.push({ id: "busy", tone: "warn", title: "Outputs", detail: `${plural(busy.length, "render")} in progress or held; apply after ${busy.length === 1 ? "it settles" : "they settle"}` });
  if (stale.length) effects.push({ id: "outputs", tone: "warn", title: "Outputs", detail: `${plural(stale.length, "ready render")} will need a new render` });
  if (posted.length) effects.push({ id: "posted", tone: "ok", title: "Posted copies", detail: `${plural(posted.length, "posted render")} unchanged` });
  if (!mine.length) effects.push({ id: "outputs", tone: "ok", title: "Outputs", detail: "No renders of this scene yet" });
  return effects;
}
