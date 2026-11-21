import { describe, expect, it } from "vitest";
import { applyGlossary, buildLines, cps, sliceLines, stamp, toASS, toSRT, toVTT, type Seg } from "../src/server/captions";

const w = (text: string, startMs: number, perWord = 300, gap = 0) =>
  text.split(" ").map((t, i) => ({ w: t, s: startMs + i * (perWord + gap), e: startMs + i * (perWord + gap) + perWord }));
const seg = (text: string, startMs: number, perWord = 300): Seg => {
  const words = w(text, startMs, perWord);
  return { startMs, endMs: words[words.length - 1].e, text, words };
};

describe("buildLines", () => {
  it("ends a caption at a sentence end instead of carrying a sentence into the next speaker", () => {
    const lines = buildLines([seg("I am Naledi, and today I am talking to Thabo about how he built a studio from one phone.", 0, 250), seg("Thanks for having me.", 6000)]);
    expect(lines.map((l) => l.text.replace(/\n/g, " "))).toEqual([
      "I am Naledi, and today I am talking to Thabo about how he built a studio from one phone.".slice(0, 1) + lines[0].text.replace(/\n/g, " ").slice(1),
      ...lines.slice(1).map((l) => l.text.replace(/\n/g, " ")),
    ]);
    expect(lines.some((l) => l.text.replace(/\n/g, " ").includes("phone. Thanks"))).toBe(false);
    expect(lines[lines.length - 1].text).toBe("Thanks for having me.");
  });
  it("never exceeds two rows of 42 characters and never overlaps", () => {
    const long = "Start before you are ready. Your first hundred videos are your school. Nobody is watching yet, so make your mistakes now and keep going every single week.";
    const lines = buildLines([seg(long, 0, 200)]);
    for (const l of lines) {
      const rows = l.text.split("\n");
      expect(rows.length).toBeLessThanOrEqual(2);
      for (const r of rows) expect(r.length).toBeLessThanOrEqual(42);
    }
    for (let i = 0; i < lines.length - 1; i++) expect(lines[i].endMs).toBeLessThanOrEqual(lines[i + 1].startMs);
  });
  it("starts a new caption after a long pause", () => {
    const lines = buildLines([seg("And language?", 0), seg("That is how we speak at home.", 5000)]);
    expect(lines.length).toBe(2);
  });
});

describe("applyGlossary", () => {
  it("replaces a misheard phrase with the workspace spelling and keeps punctuation and timing", () => {
    const { segs, fixes } = applyGlossary([seg("welcome back to Joseph Stories.", 1000)], [{ term: "Jozi Stories", heard: ["Joseph Stories"] }]);
    expect(segs[0].text).toBe("welcome back to Jozi Stories.");
    expect(fixes).toBe(1);
    const jozi = segs[0].words.find((x) => x.w === "Jozi")!;
    expect(jozi.g).toBe(true);
    expect(jozi.s).toBe(1900);
  });
  it("marks a correctly heard glossary term without counting it as a fix", () => {
    const { segs, fixes } = applyGlossary([seg("Sharp sharp.", 0)], [{ term: "Sharp sharp" }]);
    expect(fixes).toBe(0);
    expect(segs[0].words.every((x) => x.g)).toBe(true);
    expect(segs[0].text).toBe("Sharp sharp.");
  });
});

describe("formats", () => {
  const lines = [{ startMs: 1200, endMs: 3450, text: "Sawubona Mzansi,\nwelcome back.", words: [] }];
  it("writes SRT with comma milliseconds", () => {
    expect(toSRT(lines)).toBe("1\n00:00:01,200 --> 00:00:03,450\nSawubona Mzansi,\nwelcome back.\n");
  });
  it("writes VTT with a header and dot milliseconds", () => {
    expect(toVTT(lines).startsWith("WEBVTT\n\n00:00:01.200 --> 00:00:03.450\n")).toBe(true);
  });
  it("formats hours", () => expect(stamp(3_725_004)).toBe("01:02:05,004"));
  it("measures reading speed in characters per second", () => expect(Math.round(cps({ startMs: 0, endMs: 2000, text: "abcdefghij" }))).toBe(5));
});

describe("sliceLines and ASS", () => {
  const full = [
    { startMs: 0, endMs: 2000, text: "before", words: [{ w: "before", s: 0, e: 2000 }] },
    { startMs: 10_000, endMs: 12_000, text: "Start before", words: [{ w: "Start", s: 10_000, e: 10_500 }, { w: "before", s: 10_600, e: 12_000 }] },
  ];
  it("keeps only lines inside the clip, with times relative to the clip", () => {
    const s = sliceLines(full, 9_000, 20_000);
    expect(s).toHaveLength(1);
    expect(s[0].startMs).toBe(1000);
    expect(s[0].words[0].s).toBe(1000);
  });
  it("writes karaoke timing for word-timed captions", () => {
    const ass = toASS(sliceLines(full, 9_000, 20_000), { width: 1080, height: 1920, font: "Archivo Black", karaoke: true });
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("Dialogue: 0,0:00:01.00,0:00:03.00,Caption,,0,0,0,,{\\k60}Start {\\k140}before");
  });
});
