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
});
