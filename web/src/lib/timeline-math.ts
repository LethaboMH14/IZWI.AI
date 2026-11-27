export type TimelineRange = { startMs: number; endMs: number };
export type TimelineClip = TimelineRange & { id: string };

export function msToPx(ms: number, pixelsPerMs: number): number {
  return ms * pixelsPerMs;
}

export function pxToMs(px: number, pixelsPerMs: number): number {
  return pixelsPerMs > 0 ? px / pixelsPerMs : 0;
}

export function viewportRange(scrollLeft: number, width: number, labelWidth: number, pixelsPerMs: number, marginMs: number) {
  return {
    start: Math.max(0, pxToMs(Math.max(0, scrollLeft - labelWidth), pixelsPerMs) - marginMs),
    end: pxToMs(Math.max(0, scrollLeft + width - labelWidth), pixelsPerMs) + marginMs,
  };
}

export function clampTrim(
  range: TimelineRange,
  edge: "start" | "end",
  requestedMs: number,
  durationMs: number,
  minLengthMs = 1000,
  snapMs = 0,
): TimelineRange {
  const duration = Math.max(0, durationMs);
  const minLength = Math.min(Math.max(0, minLengthMs), duration);
  const snap = (ms: number) => snapMs > 0 ? Math.round(ms / snapMs) * snapMs : ms;
  if (edge === "start") {
    const startMs = Math.min(Math.max(0, snap(requestedMs)), Math.max(0, range.endMs - minLength));
    return { startMs, endMs: Math.min(duration, Math.max(range.endMs, startMs + minLength)) };
  }
  const endMs = Math.max(Math.min(duration, snap(requestedMs)), Math.min(duration, range.startMs + minLength));
  return { startMs: Math.max(0, Math.min(range.startMs, endMs - minLength)), endMs };
}

export function stackClips<T extends TimelineClip>(clips: readonly T[]): Array<T & { row: number }> {
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  const rowEnds: number[] = [];
  return sorted.map((clip) => {
    let row = rowEnds.findIndex((end) => end <= clip.startMs);
    if (row < 0) row = rowEnds.length;
    rowEnds[row] = clip.endMs;
    return { ...clip, row };
  });
}

export function envelopeSlice(peaks: readonly number[], range: TimelineRange, durationMs: number): number[] {
  if (!peaks.length || durationMs <= 0 || range.endMs <= range.startMs) return [];
  const from = Math.max(0, Math.min(peaks.length, Math.floor((range.startMs / durationMs) * peaks.length)));
  const to = Math.max(from, Math.min(peaks.length, Math.ceil((range.endMs / durationMs) * peaks.length)));
  return peaks.slice(from, to);
}

export function visibleWindow<T extends TimelineRange>(items: readonly T[], startMs: number, endMs: number): T[] {
  return items.filter((item) => item.endMs >= startMs && item.startMs <= endMs);
}

export type TrimSafetyState = {
  outputs: Array<{ clipId: string | null; status: string }>;
  readOnly?: { value: boolean; reason?: string | null };
};

export function trimBlocked(state: TrimSafetyState, clipId: string, localPendingClipIds: Iterable<string>): string | null {
  if (state.readOnly?.value) return state.readOnly.reason || "This project is read-only.";
  if ([...localPendingClipIds].includes(clipId)) return "A render request is awaiting confirmation from the project.";
  const output = state.outputs.find((item) => item.clipId === clipId && ["blocked", "queued", "running"].includes(item.status));
  if (!output) return null;
  if (output.status === "blocked") return "This scene has a blocked render.";
  return `This scene has a ${output.status} render.`;
}
