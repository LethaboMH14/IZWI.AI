// Scene helpers for the Flat Studio. A scene is a clip that is not dropped. Pure functions over ProjectState,
// tested in tests/scenes.test.ts, so the words and numbers on screen always come from the rows.
import type { ProjectState } from "@/server/state";
import type { Status } from "@/components/z/StatusPill";
import { formatTime } from "./timecode";

export type Clip = ProjectState["clips"][number];
export type Line = ProjectState["lines"][number];
export type Word = { w: string; s: number; e: number; p?: number; g?: boolean };

/** The shortest scene the API accepts. */
export const MIN_SCENE_MS = 1000;

/** Scenes in start order (ties by id), dropped clips left out. */
export function orderedScenes<T extends { id: string; startMs: number; status: string }>(clips: readonly T[]): T[] {
  return clips.filter((c) => c.status !== "dropped").sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
}

/** "Scene 2 of 4", or null when the id is not one of the scenes. */
export function sceneLabel(scenes: readonly { id: string }[], id: string | null | undefined): string | null {
  if (!id) return null;
  const at = scenes.findIndex((s) => s.id === id);
  return at < 0 ? null : `Scene ${at + 1} of ${scenes.length}`;
}

/** The first scene whose range holds `ms` (start inclusive, end exclusive); the earliest start wins on overlap. */
export function sceneAt<T extends { startMs: number; endMs: number }>(scenes: readonly T[], ms: number): T | null {
  return scenes.find((s) => ms >= s.startMs && ms < s.endMs) ?? null;
}

/** The scene the header describes: the first selected scene, else the one under the playhead, else null (the project). */
export function focusScene<T extends { id: string; startMs: number; endMs: number }>(scenes: readonly T[], selection: readonly string[], ms: number): T | null {
  if (selection.length) {
    const chosen = new Set(selection);
    const first = scenes.find((s) => chosen.has(s.id));
    if (first) return first;
  }
  return sceneAt(scenes, ms);
}

/**
 * Index of the line under `ms`: the last line that has started, if `ms` is before its end plus `graceMs`.
 * -1 when the playhead is before the first line or in a longer gap. Lines must be in start order.
 */
export function lineIndexAt(lines: readonly { startMs: number; endMs: number }[], ms: number, graceMs = 0): number {
  let lo = 0, hi = lines.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].startMs <= ms) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at >= 0 && ms >= lines[at].endMs + graceMs ? -1 : at;
}

/** Index of the word being spoken at `ms`, or -1. Word times are source milliseconds. */
export function wordIndexAt(words: readonly { s: number; e: number }[], ms: number): number {
  return words.findIndex((w) => ms >= w.s && ms < w.e);
}

/** Lines that overlap the range [startMs, endMs). */
export function linesInRange<T extends { startMs: number; endMs: number }>(lines: readonly T[], startMs: number, endMs: number): T[] {
  return lines.filter((l) => l.endMs > startMs && l.startMs < endMs);
}

/** "00:12 – 00:48" */
export function rangeText(startMs: number, endMs: number): string {
  return `${formatTime(startMs)} – ${formatTime(endMs)}`;
}

/** The reason a scene is held, in the server's own words ("Waiting on Sipho (requested)."). */
export function gateReason(gate: Clip["gate"]): string {
  if (gate.ok) return "";
  if (!gate.declaration) return "Record your creator declaration first.";
  return `Waiting on ${gate.waiting.map((w) => `${w.name} (${w.status})`).join(", ")}.`;
}

export type SceneStatus = { status: Status; word: string; reason: string | null };

/** Held beats everything: a scene the consent gate stops is Held whatever its own status. */
export function sceneStatus(clip: Pick<Clip, "status" | "gate">): SceneStatus {
  if (!clip.gate.ok) return { status: "held", word: "Held", reason: gateReason(clip.gate) };
  if (clip.status === "suggested") return { status: "draft", word: "Suggested", reason: null };
  if (clip.status === "kept") return { status: "ready", word: "Kept", reason: null };
  return { status: "unknown", word: "Unknown", reason: null };
}

/** A title for a new scene: the first seven words of the first line inside the range. */
export function titleFromLines(lines: readonly { startMs: number; endMs: number; text: string }[], startMs: number, endMs: number): string {
  const first = linesInRange(lines, startMs, endMs)[0];
  const words = (first?.text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 7).join(" ");
  return (words || "New scene").slice(0, 120);
}

export type SceneRange = { startMs: number; endMs: number };

/**
 * A range from two marks, in either order. Rounds to whole milliseconds, clamps to [0, durationMs] when the
 * duration is known, and returns null when fewer than 1 s remains.
 */
export function rangeFromMarks(a: number | null, b: number | null, durationMs: number): SceneRange | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const top = durationMs > 0 ? durationMs : Infinity;
  const startMs = Math.max(0, Math.round(Math.min(a, b)));
  const endMs = Math.min(top, Math.round(Math.max(a, b)));
  return endMs - startMs >= MIN_SCENE_MS ? { startMs, endMs } : null;
}

/** A scene range from one line; a line under 1 s is stretched to 1 s (or back from the end of the recording). */
export function rangeFromLine(line: { startMs: number; endMs: number }, durationMs: number): SceneRange | null {
  let startMs = Math.max(0, Math.round(line.startMs));
  let endMs = Math.round(line.endMs);
  if (endMs - startMs < MIN_SCENE_MS) endMs = startMs + MIN_SCENE_MS;
  if (durationMs > 0 && endMs > durationMs) { endMs = Math.round(durationMs); startMs = Math.max(0, Math.min(startMs, endMs - MIN_SCENE_MS)); }
  return endMs - startMs >= MIN_SCENE_MS ? { startMs, endMs } : null;
}

/** First and last line touched by a set of line indexes, as one range. */
export function rangeFromLineIndexes(lines: readonly { idx: number; startMs: number; endMs: number }[], indexes: readonly number[], durationMs: number): SceneRange | null {
  const hit = lines.filter((l) => indexes.includes(l.idx));
  if (!hit.length) return null;
  const startMs = Math.min(...hit.map((l) => l.startMs));
  const endMs = Math.max(...hit.map((l) => l.endMs));
  return rangeFromLine({ startMs, endMs }, durationMs);
}

/** Next playhead time after a key press, kept inside the recording. */
export function nudge(ms: number, deltaMs: number, durationMs: number): number {
  const next = ms + deltaMs;
  const top = durationMs > 0 ? durationMs : Infinity;
  return Math.min(top, Math.max(0, Math.round(next)));
}

export type TextPart = { text: string; hit: boolean };

/** Split `text` around case-insensitive matches of `query` (plain text, not a pattern). No query gives one part. */
export function splitByQuery(text: string, query: string): TextPart[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, hit: false }];
  const hay = text.toLowerCase();
  const parts: TextPart[] = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(q, from);
    if (at < 0) break;
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + q.length), hit: true });
    from = at + q.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}

/** Lines whose text contains the query (case-insensitive); all lines for an empty query. */
export function filterLines<T extends { text: string }>(lines: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? lines.filter((l) => l.text.toLowerCase().includes(q)) : [...lines];
}
