import { describe, expect, it } from "vitest";
import type { ProjectState } from "../src/server/state";
import { lineShift, trimEffects } from "../src/lib/edit-effects";
import { agentProposals, currentLabel, freshnessOf, trimOf } from "../src/lib/proposals";

const line = (startMs: number, endMs: number) => ({ id: `l${startMs}`, idx: 0, startMs, endMs, text: "x", words: [], status: "draft", flag: null, edited: false });
const base = (over: Partial<Record<string, unknown>> = {}) => ({
  project: { id: "p", title: "Jozi", kind: "podcast", spokenLanguage: "en", createdAt: 0, updatedAt: 0 },
  source: null, proxy: null, poster: null, peaks: [], packages: [], tracks: [], links: [], comments: [], listings: [], declaration: null, jobs: [],
  lines: [line(0, 12000), line(12000, 20000), line(20000, 28000), line(28000, 36000)],
  clips: [{ id: "c1", title: "Start", startMs: 12000, endMs: 36000, reason: "", origin: "model", status: "kept", gate: { ok: true } }],
  people: [], outputs: [], plans: [],
  ...over,
}) as unknown as ProjectState;

describe("lineShift", () => {
  it("counts lines that leave, join and stay", () => {
    const lines = [line(0, 12000), line(12000, 20000), line(20000, 28000)];
    expect(lineShift(lines, { startMs: 12000, endMs: 28000 }, { startMs: 14000, endMs: 28000 })).toEqual({ leave: 0, enter: 0, stay: 2 });
    expect(lineShift(lines, { startMs: 12000, endMs: 28000 }, { startMs: 21000, endMs: 28000 })).toEqual({ leave: 1, enter: 0, stay: 1 });
    expect(lineShift(lines, { startMs: 12000, endMs: 28000 }, { startMs: 0, endMs: 28000 })).toEqual({ leave: 0, enter: 1, stay: 2 });
  });
});

describe("trimEffects", () => {
  it("reports caption shifts and that no renders exist", () => {
    const e = trimEffects(base(), "c1", { startMs: 21000, endMs: 36000 });
    expect(e.find((x) => x.id === "captions")).toMatchObject({ tone: "warn", detail: "1 line leaves the scene; 2 lines stay" });
    expect(e.find((x) => x.id === "outputs")).toMatchObject({ tone: "ok", detail: "No renders of this scene yet" });
    expect(e.find((x) => x.id === "consent")).toMatchObject({ tone: "unknown" });
  });

  it("marks ready unposted renders as needing a new render and keeps posted ones", () => {
    const outputs = [
      { id: "o1", clipId: "c1", status: "ready", posted: null },
      { id: "o2", clipId: "c1", status: "ready", posted: { platform: "tiktok", url: null, at: 1 } },
      { id: "o3", clipId: "other", status: "ready", posted: null },
    ];
    const e = trimEffects(base({ outputs }), "c1", { startMs: 14000, endMs: 36000 });
    expect(e.find((x) => x.id === "outputs")?.detail).toBe("1 ready render will need a new render");
    expect(e.find((x) => x.id === "posted")?.detail).toBe("1 posted render unchanged");
  });

  it("says when a render is in progress or held", () => {
    const e = trimEffects(base({ outputs: [{ id: "o1", clipId: "c1", status: "blocked", posted: null }] }), "c1", { startMs: 14000, endMs: 36000 });
    expect(e.find((x) => x.id === "busy")?.tone).toBe("warn");
  });

  it("uses only the latest recorded consent and flags a person newly in range", () => {
    const people = [
      { id: "a", name: "Naledi", role: "host", wholeRecording: true, ranges: [], consent: { id: "k", status: "granted", scope: "voice", responded_name: "N", responded_at: 1, requested_at: 0 } },
      { id: "b", name: "Sipho", role: "guest", wholeRecording: false, ranges: [{ startMs: 37000, endMs: 50000 }], consent: null },
    ];
    const stay = trimEffects(base({ people }), "c1", { startMs: 14000, endMs: 36000 });
    expect(stay.find((x) => x.id === "consent")).toMatchObject({ tone: "ok", detail: "Naledi · voice · Granted. No new person enters" });
    const grow = trimEffects(base({ people }), "c1", { startMs: 14000, endMs: 40000 });
    expect(grow.find((x) => x.id === "consent")).toMatchObject({ tone: "warn" });
    expect(grow.find((x) => x.id === "consent")?.detail).toContain("Sipho · not asked");
    expect(grow.find((x) => x.id === "consent")?.detail).toContain("Sipho newly in range");
  });

  it("shows translation lanes as loading until their lines arrive", () => {
    const e = trimEffects(base(), "c1", { startMs: 14000, endMs: 36000 }, { t1: { language: "isiZulu", lines: null } });
    expect(e.find((x) => x.id === "tr:t1")).toMatchObject({ tone: "unknown", detail: "Loading the translated lines" });
  });
});

describe("proposals", () => {
  const step = (pre?: number) => ({ kind: "action", action: "trimClip", args: { clipId: "c1", startMs: 14000, endMs: 36000 }, pre: { clips: [{ id: "c1", updatedAt: pre }], lines: [], consent: null } });

  it("reads numbers from the plan step, not from display strings", () => {
    const s = base({ plans: [{ id: "pl1", prompt: "", planner: "assistant", steps: [step(5)], status: "proposed", created_at: 1 }] });
    const t = trimOf(s.plans[0], s);
    expect(t).toMatchObject({ clipId: "c1", current: { startMs: 12000, endMs: 36000 }, proposed: { startMs: 14000, endMs: 36000 }, freshness: "unknown" });
  });

  it("claims Original only when the clip timestamp is known to match", () => {
    const fresh = freshnessOf(step(5) as never, { id: "c1", updatedAt: 5 } as never);
    const changed = freshnessOf(step(5) as never, { id: "c1", updatedAt: 9 } as never);
    expect(fresh).toBe("fresh");
    expect(changed).toBe("changed");
    expect(currentLabel(fresh)).toBe("Original");
    expect(currentLabel("unknown")).toBe("Current range");
  });

  it("prefers the plan's live status and keeps the newest copy of each plan", () => {
    const s = base({ plans: [{ id: "pl1", prompt: "", planner: "assistant", steps: [step()], status: "dismissed", created_at: 1 }] });
    const thread = [
      { planId: "pl1", title: "Old", reason: "", preview: [], kind: "action" as const, status: "proposed" },
      { planId: "pl1", title: "New", reason: "", preview: [], kind: "action" as const, status: "proposed" },
    ];
    const out = agentProposals(thread, s);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "New", status: "dismissed" });
  });

  it("returns no trim for multi-step or job plans", () => {
    const s = base({ plans: [{ id: "pl2", prompt: "", planner: "assistant", steps: [step(), step()], status: "proposed", created_at: 1 }] });
    expect(trimOf(s.plans[0], s)).toBeNull();
  });
});
