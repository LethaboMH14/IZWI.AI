import "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import type { Ctx } from "../src/server/guard";
import type { Step } from "../src/server/planner";

let db: Db;
let planner: typeof import("../src/server/planner");
let ctx: Ctx;
beforeAll(async () => { db = await openTestDb(); ctx = seedWorkspace(db, "org_plan", "user_plan", "project_plan"); planner = await import("../src/server/planner"); }, 60_000);
afterAll(() => closeTestDb(db));

describe("assistant plan approval", () => {
  it("rejects a stale clip snapshot before running any action", () => {
    db.run(`INSERT INTO clip (id, workspace_id, project_id, title, start_ms, end_ms, reason, origin, status, created_at, updated_at) VALUES ('clip_stale', ?, 'project_plan', 'Clip', 0, 4000, 'reason', 'manual', 'suggested', 1, 1)`, ctx.workspaceId);
    const steps: Step[] = [{ kind: "action", action: "keepClip", args: { clipId: "clip_stale" }, pre: { clips: [{ id: "clip_stale", updatedAt: 1 }], lines: [], consent: null }, preview: [] }];
    const id = planner.savePlan(ctx, "project_plan", "keep clip", "assistant:test/model", steps);
    db.run(`UPDATE clip SET updated_at = 2 WHERE id = 'clip_stale'`);
    expect(() => planner.approvePlan(ctx, id)).toThrow("This changed since the assistant suggested it");
    expect(db.one<{ status: string }>(`SELECT status FROM clip WHERE id = 'clip_stale'`)?.status).toBe("suggested");
    expect(db.one<{ status: string }>(`SELECT status FROM plan_run WHERE id = ?`, id)?.status).toBe("proposed");
  });

  it("rejects dependencies outside the plan unless already succeeded in the project", () => {
    const steps: Step[] = [{ kind: "job", verb: "Cut", what: "Cut", tool: "IZWI", runs: "device", runnable: true, stepId: "cut", dependsOn: ["job_foreign"] }];
    const id = planner.savePlan(ctx, "project_plan", "cut", "assistant:test/model", steps);
    expect(() => planner.approvePlan(ctx, id)).toThrow("This changed since the assistant suggested it");
    expect(db.one<{ n: number }>(`SELECT COUNT(*) n FROM job WHERE project_id = 'project_plan'`)?.n).toBe(0);
  });

  it("does not resolve a plan owned by another workspace", () => {
    const other = seedWorkspace(db, "org_other", "user_other", "project_other");
    const id = planner.savePlan(other, "project_other", "publish", "assistant:test/model", [{ kind: "job", verb: "Publish", what: "Publish", tool: "IZWI", runs: "device", runnable: true }]);
    expect(planner.approvePlan(ctx, id)).toBeNull();
  });

  it("strict action schemas require a bound target and bounded trim, glossary and consent arguments", () => {
    const { StepSchema } = planner;
    expect(StepSchema.safeParse({ kind: "action", action: "keepClip", args: { clipId: "clip_x" }, pre: { clips: [], lines: [], consent: null } }).success).toBe(false);
    expect(StepSchema.safeParse({ kind: "action", action: "trimClip", args: { clipId: "clip_x", startMs: 0, endMs: 999 }, pre: { clips: [{ id: "clip_x", updatedAt: 0 }], lines: [], consent: null } }).success).toBe(false);
    expect(StepSchema.safeParse({ kind: "action", action: "addGlossaryTerm", args: { term: "x".repeat(61) }, pre: { clips: [], lines: [], consent: null } }).success).toBe(false);
    expect(StepSchema.safeParse({ kind: "action", action: "requestConsent", args: { personId: "p", scope: "unknown" }, pre: { clips: [], lines: [], consent: { personId: "p", id: null, updatedAt: null, ledgerSeq: null } } }).success).toBe(false);
  });

  it("re-parses strict action schemas at approval and runs no tampered step", () => {
    db.run(`INSERT INTO clip (id, workspace_id, project_id, title, start_ms, end_ms, reason, origin, status, created_at, updated_at) VALUES ('clip_tamper', ?, 'project_plan', 'Clip', 0, 4000, 'reason', 'manual', 'suggested', 1, 1)`, ctx.workspaceId);
    const id = planner.savePlan(ctx, "project_plan", "keep", "assistant:test/model", [{ kind: "action", action: "keepClip", args: { clipId: "clip_tamper" }, pre: { clips: [{ id: "clip_tamper", updatedAt: 1 }], lines: [], consent: null } }] as unknown as Step[]);
    db.run(`UPDATE plan_run SET steps = ? WHERE id = ?`, JSON.stringify([{ kind: "action", action: "keepClip", args: { clipId: "clip_tamper" }, pre: { clips: [], lines: [], consent: null } }]), id);
    expect(() => planner.approvePlan(ctx, id)).toThrow(expect.objectContaining({ status: 409 }));
    expect(db.one<{ status: string }>(`SELECT status FROM clip WHERE id = 'clip_tamper'`)?.status).toBe("suggested");
  });

  it("workspace glossary approval uses the exact snapshot across projects and rejects a newly matching line", async () => {
    const actions = await import("../src/server/actions");
    const secondProject = "project_plan_second";
    db.run(`INSERT INTO project (id, workspace_id, title, kind, created_by, created_at, updated_at) VALUES (?, ?, 'Other', 'podcast', ?, 1, 1)`, secondProject, ctx.workspaceId, ctx.userId);
    const addLine = (suffix: string, projectId: string, text: string) => {
      const trackId = db.one<{ id: string }>(`SELECT id FROM caption_track WHERE project_id = ? AND kind = 'source'`, projectId)?.id ?? `track_${suffix}`;
      if (!db.one(`SELECT 1 FROM caption_track WHERE id = ?`, trackId)) db.run(`INSERT INTO caption_track (id, workspace_id, project_id, language, kind, status, engine, created_at, updated_at) VALUES (?, ?, ?, 'en', 'source', 'draft', 'test', 1, 1)`, trackId, ctx.workspaceId, projectId);
      const idx = db.one<{ n: number }>(`SELECT COALESCE(MAX(idx), -1) + 1 n FROM caption_line WHERE track_id = ?`, trackId)!.n;
      db.run(`INSERT INTO caption_line (id, track_id, idx, start_ms, end_ms, text, words, status) VALUES (?, ?, ?, 0, 1000, ?, ?, 'draft')`, `line_${suffix}`, trackId, idx, text, JSON.stringify([{ w: text }]));
    };
    addLine("glossary_a", "project_plan", "misheard");
    addLine("glossary_b", secondProject, "misheard");
    const input = { term: "Molo", heard: "misheard" };
    const affected = actions.previewGlossaryChanges(ctx.workspaceId, input);
    const pre = { clips: [], lines: affected.map(({ id, textHash }) => ({ id, textHash })), consent: null };
    const id = planner.savePlan(ctx, "project_plan", "glossary", "assistant:test/model", [{ kind: "action", action: "addGlossaryTerm", args: input, pre }] as unknown as Step[]);
    expect(planner.approvePlan(ctx, id)).toMatchObject({ already: false });
    expect(db.one<{ text: string }>(`SELECT text FROM caption_line WHERE id = 'line_glossary_b'`)?.text).toContain("Molo");

    const snapshot = actions.previewGlossaryChanges(ctx.workspaceId, input);
    const stale = planner.savePlan(ctx, "project_plan", "glossary", "assistant:test/model", [{ kind: "action", action: "addGlossaryTerm", args: input, pre: { clips: [], lines: snapshot.map(({ id: lineId, textHash }) => ({ id: lineId, textHash })), consent: null } }] as unknown as Step[]);
    addLine("glossary_c", secondProject, "misheard");
    expect(() => planner.approvePlan(ctx, stale)).toThrow("This changed since the assistant suggested it");
    expect(db.one<{ text: string }>(`SELECT text FROM caption_line WHERE id = 'line_glossary_c'`)?.text).toContain("misheard");
  });
});
