import "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { call, sessionFor, type Session } from "./helpers/api";

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("../src/server/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
let db: Db;
beforeAll(async () => { db = await openTestDb(); await seedWorkspace(db, "org_design", "own_design", "prj_design"); });
afterAll(async () => { delete process.env.IZWI_FLAG_DESIGN; await closeTestDb(db); });

describe("saved Design mock-ups", () => {
  it("is unavailable while the feature flag is off", async () => {
    delete process.env.IZWI_FLAG_DESIGN; state.session = sessionFor("own_design", "org_design") as Session;
    const route = await import("../src/app/api/projects/[id]/design/route");
    expect((await call(route.GET, "GET", "/api/projects/prj_design/design", { params: { id: "prj_design" } })).status).toBe(404);
  });
  it("stores a text mock-up, then records explicit creator approval", async () => {
    process.env.IZWI_FLAG_DESIGN = "1"; state.session = sessionFor("own_design", "org_design") as Session;
    const route = await import("../src/app/api/projects/[id]/design/route");
    const params = { params: { id: "prj_design" } };
    const created = await call(route.POST, "POST", "/api/projects/prj_design/design", { ...params, json: { artifact: "poster", platform: "general", headline: "Community gathering", subtitle: "12 December", accent: "forest" } });
    expect(created.status).toBe(200); expect(created.data).toMatchObject({ status: "draft", headline: "Community gathering" });
    const draftId = (created.data as unknown as { id: string }).id;
    expect((await call(route.PATCH, "PATCH", "/api/projects/prj_design/design", { ...params, json: { id: draftId, action: "approve" } })).data).toMatchObject({ status: "approved" });
    expect((await call(route.GET, "GET", "/api/projects/prj_design/design", params)).data).toMatchObject({ drafts: [{ id: draftId, status: "approved" }] });
  });
});
