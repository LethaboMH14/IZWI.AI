import { describe, expect, it } from "vitest";
import type { ProjectState } from "../src/server/state";
import { buildGraph, COL_W, litEdges } from "../src/lib/spatial-layout";

const state = (over: Partial<Record<string, unknown>> = {}) => ({
  project: { id: "p", title: "Jozi", kind: "podcast", spokenLanguage: "en", createdAt: 0, updatedAt: 0 },
  source: { id: "a1", filename: "sim_ep04.mp4", durationMs: 79680 }, proxy: null, poster: null, peaks: [], packages: [], links: [], comments: [], declaration: null, jobs: [],
  lines: [{ id: "l1", startMs: 0, endMs: 1000 }],
  clips: [
    { id: "c2", title: "Later", startMs: 40000, endMs: 70000, status: "kept", gate: { ok: true } },
    { id: "c1", title: "Opening", startMs: 12000, endMs: 36000, status: "suggested", gate: { ok: false } },
    { id: "c3", title: "Gone", startMs: 1000, endMs: 5000, status: "dropped", gate: { ok: true } },
  ],
  tracks: [
    { id: "t2", language: "zu", kind: "translation", status: "draft", lines: 14, approved: 9, updated_at: 1 },
    { id: "t1", language: "en", kind: "source", status: "approved", lines: 14, approved: 0, updated_at: 1 },
  ],
  outputs: [{ id: "o1", clipId: "c2", preset: "vertical", language: "zu", burn: true, status: "ready", posted: null, createdAt: 5 }],
  people: [
    { id: "pB", name: "Sipho", role: "guest", wholeRecording: false, ranges: [{ startMs: 50000, endMs: 60000 }], consent: { status: "requested", scope: "voice" } },
    { id: "pA", name: "Naledi", role: "host", wholeRecording: true, ranges: [], consent: { status: "granted", scope: "voice" } },
  ],
  listings: [{ id: "L1", clipId: "c2", title: "Later", enabled: true, enquiries: [{ id: "q" }] }],
  plans: [{ id: "pl1", prompt: "", planner: "assistant", steps: [{ kind: "action", action: "trimClip", args: { clipId: "c1", startMs: 14000, endMs: 36000 }, pre: { clips: [{ id: "c1", updatedAt: 1 }] } }], status: "proposed", created_at: 1 }],
  ...over,
}) as unknown as ProjectState;

describe("buildGraph", () => {
  it("orders scenes by start, drops dropped clips, puts the source track first", () => {
    const g = buildGraph(state());
    expect(g.nodes.filter((n) => n.kind === "scene").map((n) => n.data.refId)).toEqual(["c1", "c2"]);
    expect(g.nodes.filter((n) => n.kind === "language").map((n) => n.data.refId)).toEqual(["t1", "t2"]);
    expect(g.nodes.find((n) => n.id === "scene:c1")).toMatchObject({ position: { x: COL_W, y: 0 }, data: { state: "Held", tone: "held" } });
  });

  it("is deterministic regardless of input order", () => {
    const a = buildGraph(state());
    const s = state();
    const shuffled = { ...s, clips: [...s.clips].reverse(), tracks: [...s.tracks].reverse(), people: [...s.people].reverse() } as ProjectState;
    expect(buildGraph(shuffled)).toEqual(a);
  });

  it("links outputs to their scene and language, people to the scenes they appear in", () => {
    const g = buildGraph(state());
    const ids = g.edges.map((e) => e.id).sort();
    expect(ids).toContain("e:c2>o1");
    expect(ids).toContain("e:t2>o1");
    expect(ids).toContain("e:pA>c1"); // whole recording
    expect(ids).toContain("e:pA>c2");
    expect(ids).toContain("e:pB>c2"); // range overlap
    expect(ids).not.toContain("e:pB>c1");
    expect(g.edges.find((e) => e.id === "e:pB>c2")).toMatchObject({ dashed: true, tone: "working" });
    expect(g.nodes.find((n) => n.id === "offer:L1")?.data.state).toBe("1 enquiry");
  });

  it("attaches a pending AI trim to its scene only when its plan is still proposed", () => {
    const thread = [{ planId: "pl1", title: "Tighter opening", reason: "", preview: [], kind: "action" as const }];
    const g = buildGraph(state(), { proposals: thread });
    expect(g.nodes.find((n) => n.id === "prop:pl1")).toMatchObject({ data: { meta: "00:14 – 00:36 · 22s", tone: "proposal" } });
    const done = buildGraph(state({ plans: [{ ...state().plans[0], status: "approved" }] }), { proposals: thread });
    expect(done.nodes.some((n) => n.id === "prop:pl1")).toBe(false);
  });

  it("lights only the edges touching the selection", () => {
    const g = buildGraph(state());
    const lit = litEdges(g, new Set(["scene:c2"]));
    expect([...lit].sort()).toEqual(["e:c2>o1", "e:c2>offer:L1", "e:pA>c2", "e:pB>c2", "e:src>c2"].sort());
  });
});
