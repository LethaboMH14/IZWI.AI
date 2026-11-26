import { describe, expect, it } from "vitest";
import type { ProjectState } from "@/server/state";
import { stageCounts, projectBusy } from "../src/lib/stage-counts";

function fixture(overrides: Record<string, unknown> = {}): ProjectState {
  return {
    source: null, clips: [], jobs: [], tracks: [], lines: [], outputs: [], people: [], listings: [],
    ...overrides,
  } as unknown as ProjectState;
}

describe("stageCounts", () => {
  it("covers Create idle, transcribing, live and kept branches", () => {
    expect(stageCounts(fixture())[0]).toMatchObject({ tone: "idle", detail: "No recording yet" });
    expect(stageCounts(fixture({ source: {}, jobs: [{ type: "transcribe", status: "running" }] }))[0]).toMatchObject({ tone: "working", detail: "Transcribing" });
    expect(stageCounts(fixture({ source: {}, clips: [{ id: "a", status: "ready", gate: { ok: true } }] }))[0]).toMatchObject({ tone: "working", count: "1 scene" });
    expect(stageCounts(fixture({ source: {}, clips: [{ id: "a", status: "kept", gate: { ok: true } }] }))[0]).toMatchObject({ tone: "done", detail: "1 kept of 1 scene" });
    expect(stageCounts(fixture({ source: {}, lines: [{}] }))[0].detail).toBe("Transcript ready, no scenes yet");
  });

  it("covers Localise idle, partial and complete branches", () => {
    expect(stageCounts(fixture())[1]).toMatchObject({ tone: "idle", detail: "No translations yet" });
    expect(stageCounts(fixture({ tracks: [{ kind: "translation", lines: 2, approved: 1 }] }))[1]).toMatchObject({ count: "1/2", tone: "working" });
    expect(stageCounts(fixture({ tracks: [{ kind: "translation", lines: 2, approved: 2 }] }))[1].tone).toBe("done");
  });

  it("covers Protect idle, held and clear branches", () => {
    expect(stageCounts(fixture())[2]).toMatchObject({ tone: "idle" });
    expect(stageCounts(fixture({ clips: [{ status: "ready", gate: { ok: false } }] }))[2]).toMatchObject({ tone: "held", count: "1 held" });
    expect(stageCounts(fixture({ clips: [{ status: "ready", gate: { ok: true } }] }))[2]).toMatchObject({ tone: "done", count: "Clear" });
  });

  it("covers Publish ready, rendering, held, failed and idle branches", () => {
    for (const [status, tone] of [["ready", "done"], ["running", "working"], ["blocked", "held"], ["failed", "held"]]) {
      expect(stageCounts(fixture({ outputs: [{ status }] }))[3].tone).toBe(tone);
    }
    expect(stageCounts(fixture())[3]).toMatchObject({ tone: "idle", detail: "Nothing rendered yet" });
  });

  it("covers Earn enquiry, enabled offer and disabled/no offer branches", () => {
    expect(stageCounts(fixture({ listings: [{ enabled: true, enquiries: [{}] }] }))[4]).toMatchObject({ count: "1 enquiry", tone: "working" });
    expect(stageCounts(fixture({ listings: [{ enabled: true, enquiries: [] }] }))[4]).toMatchObject({ count: "1 offer", tone: "done" });
    expect(stageCounts(fixture({ listings: [{ enabled: false, enquiries: [] }] }))[4].detail).toBe("Licence offer switched off");
    expect(stageCounts(fixture())[4].detail).toBe("No licence offer yet");
  });

  it("detects every busy source", () => {
    expect(projectBusy(fixture({ jobs: [{ status: "queued" }] }))).toBe(true);
    expect(projectBusy(fixture({ outputs: [{ status: "running" }] }))).toBe(true);
    expect(projectBusy(fixture({ people: [{ consent: { status: "requested" } }] }))).toBe(true);
    expect(projectBusy(fixture())).toBe(false);
  });
});
