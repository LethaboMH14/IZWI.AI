import { describe, expect, it } from "vitest";
import {
  filterLines, focusScene, gateReason, lineIndexAt, linesInRange, nudge, orderedScenes, rangeFromLine, rangeFromLineIndexes,
  rangeFromMarks, rangeText, sceneAt, sceneLabel, sceneStatus, splitByQuery, titleFromLines, wordIndexAt,
} from "../src/lib/scenes";

const ok = { ok: true, declaration: true, waiting: [] };
const clip = (id: string, startMs: number, endMs: number, status = "kept", gate: typeof ok | { ok: false; declaration: boolean; waiting: { personId: string; name: string; status: string }[] } = ok) =>
  ({ id, title: id, startMs, endMs, status, gate, reason: "", origin: "manual" });

const clips = [
  clip("c", 4000, 9000, "dropped"),
  clip("b", 12000, 48000),
  clip("a", 0, 12000, "suggested"),
  clip("z", 12000, 20000), // same start as b: id breaks the tie
];

describe("orderedScenes", () => {
  it("drops dropped clips and orders by start, then id", () => {
    expect(orderedScenes(clips).map((c) => c.id)).toEqual(["a", "b", "z"]);
  });
  it("does not mutate its input", () => {
    const copy = [...clips];
    orderedScenes(clips);
    expect(clips).toEqual(copy);
  });
});

describe("sceneLabel", () => {
  const scenes = orderedScenes(clips);
  it("numbers a scene against the total", () => {
    expect(sceneLabel(scenes, "a")).toBe("Scene 1 of 3");
    expect(sceneLabel(scenes, "z")).toBe("Scene 3 of 3");
  });
  it("is null for a missing or dropped scene", () => {
    expect(sceneLabel(scenes, "c")).toBeNull();
    expect(sceneLabel(scenes, null)).toBeNull();
  });
});

describe("sceneAt and focusScene", () => {
  const scenes = orderedScenes(clips);
  it("finds the scene under a time, end exclusive, earliest start first", () => {
    expect(sceneAt(scenes, 0)?.id).toBe("a");
    expect(sceneAt(scenes, 11999)?.id).toBe("a");
    expect(sceneAt(scenes, 12000)?.id).toBe("b");
    expect(sceneAt(scenes, 48000)).toBeNull();
  });
  it("prefers the selection over the playhead, then falls back to the project", () => {
    expect(focusScene(scenes, ["z"], 0)?.id).toBe("z");
    expect(focusScene(scenes, ["z", "a"], 30000)?.id).toBe("a"); // first selected in start order
    expect(focusScene(scenes, ["gone"], 5000)?.id).toBe("a");
    expect(focusScene(scenes, [], 60000)).toBeNull();
  });
});

describe("lineIndexAt", () => {
  const lines = [
    { startMs: 0, endMs: 5000 },
    { startMs: 6000, endMs: 9000 },
    { startMs: 9000, endMs: 12000 },
  ];
  it("finds the line under the playhead", () => {
    expect(lineIndexAt(lines, 0)).toBe(0);
    expect(lineIndexAt(lines, 4999)).toBe(0);
    expect(lineIndexAt(lines, 9000)).toBe(2);
  });
  it("is -1 in a gap and past the end, unless a grace is given", () => {
    expect(lineIndexAt(lines, 5500)).toBe(-1);
    expect(lineIndexAt(lines, 5500, 800)).toBe(0);
    expect(lineIndexAt(lines, 20000)).toBe(-1);
  });
  it("is -1 before the first line and for no lines", () => {
    expect(lineIndexAt([{ startMs: 1000, endMs: 2000 }], 500)).toBe(-1);
    expect(lineIndexAt([], 0)).toBe(-1);
  });
});

describe("wordIndexAt and linesInRange", () => {
  it("finds the spoken word, end exclusive", () => {
    const words = [{ s: 0, e: 400 }, { s: 400, e: 900 }];
    expect(wordIndexAt(words, 0)).toBe(0);
    expect(wordIndexAt(words, 400)).toBe(1);
    expect(wordIndexAt(words, 900)).toBe(-1);
  });
  it("selects the lines that overlap a range", () => {
    const lines = [{ startMs: 0, endMs: 1000 }, { startMs: 1000, endMs: 2000 }, { startMs: 2000, endMs: 3000 }];
    expect(linesInRange(lines, 1000, 2000)).toEqual([lines[1]]);
    expect(linesInRange(lines, 500, 2500)).toHaveLength(3);
  });
});

describe("sceneStatus", () => {
  it("names kept and suggested scenes", () => {
    expect(sceneStatus(clip("k", 0, 1000, "kept"))).toEqual({ status: "ready", word: "Kept", reason: null });
    expect(sceneStatus(clip("s", 0, 1000, "suggested"))).toEqual({ status: "draft", word: "Suggested", reason: null });
  });
  it("holds a gated scene and gives the gate's reason", () => {
    const gate = { ok: false as const, declaration: true, waiting: [{ personId: "p", name: "Sipho", status: "requested" }, { personId: "q", name: "Naledi", status: "not asked" }] };
    expect(sceneStatus(clip("h", 0, 1000, "kept", gate))).toEqual({ status: "held", word: "Held", reason: "Waiting on Sipho (requested), Naledi (not asked)." });
    expect(gateReason({ ok: false, declaration: false, waiting: [] })).toBe("Record your creator declaration first.");
    expect(gateReason(ok)).toBe("");
  });
  it("is unknown for any other status", () => {
    expect(sceneStatus(clip("d", 0, 1000, "dropped")).status).toBe("unknown");
  });
});

describe("ranges", () => {
  it("builds a range from two marks in either order", () => {
    expect(rangeFromMarks(12000, 48000, 79700)).toEqual({ startMs: 12000, endMs: 48000 });
    expect(rangeFromMarks(48000, 12000, 79700)).toEqual({ startMs: 12000, endMs: 48000 });
  });
  it("clamps to the recording and needs one second", () => {
    expect(rangeFromMarks(70000, 90000, 79700)).toEqual({ startMs: 70000, endMs: 79700 });
    expect(rangeFromMarks(1000, 1999, 79700)).toBeNull();
    expect(rangeFromMarks(1000, 2000, 79700)).toEqual({ startMs: 1000, endMs: 2000 });
    expect(rangeFromMarks(null, 5000, 79700)).toBeNull();
    expect(rangeFromMarks(NaN, 5000, 79700)).toBeNull();
  });
  it("stretches a short line to one second and keeps it inside the recording", () => {
    expect(rangeFromLine({ startMs: 5000, endMs: 5400 }, 79700)).toEqual({ startMs: 5000, endMs: 6000 });
    expect(rangeFromLine({ startMs: 79500, endMs: 79700 }, 79700)).toEqual({ startMs: 78700, endMs: 79700 });
    expect(rangeFromLine({ startMs: 0, endMs: 300 }, 500)).toBeNull(); // recording shorter than a scene
  });
  it("joins the first and last touched line", () => {
    const lines = [
      { idx: 0, startMs: 0, endMs: 4000 }, { idx: 1, startMs: 4000, endMs: 8000 }, { idx: 2, startMs: 8000, endMs: 12000 },
    ];
    expect(rangeFromLineIndexes(lines, [2, 1], 79700)).toEqual({ startMs: 4000, endMs: 12000 });
    expect(rangeFromLineIndexes(lines, [9], 79700)).toBeNull();
  });
});

describe("text helpers", () => {
  it("titles a scene from the first line inside it", () => {
    const lines = [{ startMs: 0, endMs: 5000, text: "The street found its voice again in Johannesburg." }, { startMs: 5000, endMs: 9000, text: "Second." }];
    expect(titleFromLines(lines, 5000, 9000)).toBe("Second.");
    expect(titleFromLines(lines, 0, 9000)).toBe("The street found its voice again in");
    expect(titleFromLines(lines, 50000, 60000)).toBe("New scene");
  });
  it("writes a range as timecodes", () => {
    expect(rangeText(12000, 48000)).toBe("00:12 – 00:48");
    expect(rangeText(64000, 79000)).toBe("01:04 – 01:19");
  });
  it("nudges the playhead inside the recording", () => {
    expect(nudge(1000, -5000, 79700)).toBe(0);
    expect(nudge(79000, 5000, 79700)).toBe(79700);
    expect(nudge(10000, 1000, 0)).toBe(11000);
  });
});

describe("search", () => {
  it("splits text around every match, ignoring case", () => {
    expect(splitByQuery("Start before you are ready, start now", "START")).toEqual([
      { text: "Start", hit: true }, { text: " before you are ready, ", hit: false }, { text: "start", hit: true }, { text: " now", hit: false },
    ]);
  });
  it("returns the text whole for no query or no match, and treats the query as plain text", () => {
    expect(splitByQuery("hello", "  ")).toEqual([{ text: "hello", hit: false }]);
    expect(splitByQuery("hello", "xyz")).toEqual([{ text: "hello", hit: false }]);
    expect(splitByQuery("a.b", ".")).toEqual([{ text: "a", hit: false }, { text: ".", hit: true }, { text: "b", hit: false }]);
  });
  it("filters lines by the same rule", () => {
    const lines = [{ text: "The street" }, { text: "Community" }];
    expect(filterLines(lines, "STREET")).toEqual([lines[0]]);
    expect(filterLines(lines, "")).toEqual(lines);
  });
});
