import { describe, expect, it } from "vitest";
import { clampTrim, envelopeSlice, msToPx, pxToMs, stackClips, trimBlocked, viewportRange, visibleWindow } from "../src/lib/timeline-math";

describe("timeline math", () => {
  it("keeps the right edge of the viewport after even a partial label-width scroll", () => {
    expect(viewportRange(0, 400, 96, 0.1, 1000)).toEqual({ start: 0, end: 4040 });
    expect(viewportRange(48, 400, 96, 0.1, 1000)).toEqual({ start: 0, end: 4520 });
    expect(viewportRange(300, 400, 96, 0.1, 1000)).toEqual({ start: 1040, end: 7040 });
  });

  it("uses the exact playhead time for unsnapped trims and clamps it when necessary", () => {
    const range = { startMs: 1000, endMs: 5000 };
    expect(clampTrim(range, "start", 1234, 6000).startMs).toBe(1234);
    expect(clampTrim(range, "start", 4500, 6000).startMs).toBe(4000);
    expect(clampTrim(range, "end", 7000, 6000).endMs).toBe(6000);
  });
  it("converts source time using one shared scale", () => {
    expect(msToPx(2500, 0.08)).toBe(200);
    expect(pxToMs(200, 0.08)).toBe(2500);
    expect(pxToMs(200, 0)).toBe(0);
  });

  it("clamps and snaps trims to source bounds while preserving the minimum length", () => {
    expect(clampTrim({ startMs: 2000, endMs: 5000 }, "start", -100, 10000, 1000, 100)).toEqual({ startMs: 0, endMs: 5000 });
    expect(clampTrim({ startMs: 2000, endMs: 5000 }, "start", 4900, 10000)).toEqual({ startMs: 4000, endMs: 5000 });
    expect(clampTrim({ startMs: 2000, endMs: 5000 }, "end", 20000, 7000)).toEqual({ startMs: 2000, endMs: 7000 });
    expect(clampTrim({ startMs: 2000, endMs: 5000 }, "end", 2100, 10000)).toEqual({ startMs: 2000, endMs: 3000 });
  });

  it("stacks overlapping clips deterministically after sorting by start and id", () => {
    expect(stackClips([
      { id: "b", startMs: 1000, endMs: 3000 },
      { id: "c", startMs: 1000, endMs: 2000 },
      { id: "a", startMs: 0, endMs: 1500 },
      { id: "d", startMs: 3000, endMs: 4000 },
    ])).toEqual([
      { id: "a", startMs: 0, endMs: 1500, row: 0 },
      { id: "b", startMs: 1000, endMs: 3000, row: 1 },
      { id: "c", startMs: 1000, endMs: 2000, row: 2 },
      { id: "d", startMs: 3000, endMs: 4000, row: 0 },
    ]);
  });

  it("slices recording envelope buckets proportionally to source duration", () => {
    expect(envelopeSlice([0, 1, 2, 3, 4, 5, 6, 7], { startMs: 250, endMs: 750 }, 1000)).toEqual([2, 3, 4, 5]);
    expect(envelopeSlice([], { startMs: 0, endMs: 1 }, 1000)).toEqual([]);
  });

  it("keeps only lane items touching the visible time window", () => {
    expect(visibleWindow([
      { startMs: 0, endMs: 1000 }, { startMs: 1000, endMs: 2000 }, { startMs: 3000, endMs: 4000 },
    ], 1900, 3000)).toEqual([{ startMs: 1000, endMs: 2000 }, { startMs: 3000, endMs: 4000 }]);
  });

  it("blocks trims for active outputs, local pending renders, and read-only projects", () => {
    const base = { outputs: [{ clipId: "c1", status: "ready" }] };
    expect(trimBlocked(base, "c1", [])).toBeNull();
    for (const status of ["blocked", "queued", "running"]) {
      expect(trimBlocked({ outputs: [{ clipId: "c1", status }] }, "c1", [])).toContain(status);
    }
    expect(trimBlocked(base, "c1", ["c1"])).toContain("awaiting confirmation");
    expect(trimBlocked({ ...base, readOnly: { value: true, reason: "Open in another tab" } }, "c1", [])).toBe("Open in another tab");
  });
});
