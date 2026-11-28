// Clip suggestions are measured from the transcript, with no model. These tests pin the rules a creator relies on:
// lengths stay inside the limits, clips do not overlap, and every reason is a fact about the recording.
import { describe, expect, it } from "vitest";
import { clipDefaults, sentences, suggestClips } from "../src/server/clips";
import type { Seg } from "../src/server/captions";

// A synthetic recording: 20 sentences, one every 6 s, with a question-and-answer pair in the middle.
const segs: Seg[] = Array.from({ length: 20 }, (_, i) => {
  const text = i === 9 ? "Why did you start the band?" : i === 10 ? "We started because nobody else played our streets." : `Sentence number ${i} about the taxi rank.`;
  const startMs = i * 6000;
  const endMs = startMs + 5000;
  const words = text.split(" ").map((w, k, all) => ({ w, s: startMs + k * (5000 / all.length), e: startMs + (k + 1) * (5000 / all.length) }));
  return { startMs, endMs, text, words };
});

describe("sentences", () => {
  it("splits on sentence-ending punctuation and marks questions", () => {
    const s = sentences(segs);
    expect(s).toHaveLength(20);
    expect(s[9].question).toBe(true);
    expect(s[10].question).toBe(false);
    expect(s[0].startMs).toBe(0);
    expect(s[0].endMs).toBe(5000);
  });

  it("uses the whole segment when a segment has no word timings", () => {
    const s = sentences([{ startMs: 1000, endMs: 4000, text: "One short line.", words: [] }]);
    expect(s).toEqual([expect.objectContaining({ startMs: 1000, endMs: 4000, words: 1 })]);
  });
});

describe("suggestClips", () => {
  const options = { count: 3, minMs: 12000, maxMs: 75000, targetMs: 35000 };

  it("returns at most the requested number, in time order", () => {
    const clips = suggestClips(segs, options);
    expect(clips.length).toBeLessThanOrEqual(3);
    expect(clips.length).toBeGreaterThan(0);
    for (let i = 1; i < clips.length; i++) expect(clips[i].startMs).toBeGreaterThanOrEqual(clips[i - 1].startMs);
  });

  it("keeps every clip inside the length limits", () => {
    for (const c of suggestClips(segs, options)) {
      const dur = c.endMs - c.startMs;
      expect(dur).toBeGreaterThanOrEqual(options.minMs);
      expect(dur).toBeLessThanOrEqual(options.maxMs);
    }
  });

  it("never picks two clips that sit within a second of each other", () => {
    const clips = suggestClips(segs, { ...options, count: 10 });
    for (let i = 1; i < clips.length; i++) expect(clips[i].startMs).toBeGreaterThanOrEqual(clips[i - 1].endMs + 1000);
  });

  it("gives every clip a reason made of measured facts and a title from the transcript", () => {
    for (const c of suggestClips(segs, options)) {
      expect(c.reason).toMatch(/\d+ s at [\d.]+ words a second\.$/);
      expect(c.title.length).toBeLessThanOrEqual(61);
      expect(segs.some((seg) => seg.text.includes(c.title.replace(/…$/, "").slice(0, 10)))).toBe(true);
    }
  });

  it("returns nothing when no sentence run fits the limits", () => {
    expect(suggestClips(segs, { count: 3, minMs: 900_000, maxMs: 1_000_000, targetMs: 950_000 })).toEqual([]);
  });
});

describe("clipDefaults", () => {
  it("has a sensible order for every media kind: minimum below target below maximum", () => {
    for (const [kind, o] of Object.entries(clipDefaults)) {
      expect(o.minMs, kind).toBeLessThan(o.targetMs);
      expect(o.targetMs, kind).toBeLessThan(o.maxMs);
    }
  });
});
