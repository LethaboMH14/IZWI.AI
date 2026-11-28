import "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { call, sessionFor, type Session } from "./helpers/api";

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("../src/server/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
let db: Db;
beforeAll(async () => {
  db = await openTestDb(); await seedWorkspace(db, "org_sched", "own_sched", "prj_sched");
  await db.run(`INSERT INTO clip (id, workspace_id, project_id, title, start_ms, end_ms, reason, origin, status, created_at, updated_at) VALUES ('clip_sched','org_sched','prj_sched','Clip',0,10000,'test','manual','kept',1,1)`);
  await db.run(`INSERT INTO output (id, workspace_id, project_id, clip_id, preset, status, created_by, created_at, updated_at) VALUES ('out_sched','org_sched','prj_sched','clip_sched','vertical','ready','own_sched',1,1)`);
  await db.run(`INSERT INTO policy_check (id, workspace_id, output_id, platform, result, findings, checked_at, checked_by) VALUES ('policy_sched','org_sched','out_sched','youtube','review','[]',1,'own_sched')`);
});
afterAll(async () => { delete process.env.IZWI_FLAG_SCHEDULED_POSTS; await closeTestDb(db); });

describe("scheduled post manual export", () => {
  it("is hidden while its flag is off", async () => {
    delete process.env.IZWI_FLAG_SCHEDULED_POSTS;
    state.session = sessionFor("own_sched", "org_sched") as Session;
    const route = await import("../src/app/api/post-schedules/route");
    expect((await call(route.POST, "POST", "/api/post-schedules", { json: {} })).status).toBe(404);
  });
  it("requires policy review acknowledgement and only records a manual export", async () => {
    process.env.IZWI_FLAG_SCHEDULED_POSTS = "1";
    state.session = sessionFor("own_sched", "org_sched") as Session;
    const route = await import("../src/app/api/post-schedules/route");
    const base = { outputId: "out_sched", platform: "youtube", scheduledAt: Date.now() + 3600000, timezone: "Africa/Johannesburg", title: "Edited title", description: "Description", tags: ["community"], acknowledgeReview: false };
    expect((await call(route.POST, "POST", "/api/post-schedules", { json: base })).status).toBe(409);
    const result = await call(route.POST, "POST", "/api/post-schedules", { json: { ...base, acknowledgeReview: true } });
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ status: "manual_export", policyStatus: "review", timezone: "Africa/Johannesburg" });
    const data = result.data as unknown as { id: string; message: string };
    expect(data.message).toContain("has not scheduled or posted");
    expect(await db.one<{ status: string }>("SELECT status FROM post_schedule WHERE id = ?", data.id)).toEqual({ status: "manual_export" });
  });
});
