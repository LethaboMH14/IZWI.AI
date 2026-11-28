import "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { call, sessionFor, type Session } from "./helpers/api";
import { CREATOR_NICHES, NICHE_TIPS } from "../src/lib/niche-tips";

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("../src/server/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
let db: Db;
beforeAll(async () => { db = await openTestDb(); await seedWorkspace(db, "org_niche", "own_niche", "prj_niche"); });
afterAll(async () => { delete process.env.IZWI_FLAG_HOME_TIPS; await closeTestDb(db); });

describe("Home creator tips", () => {
  it("has practical reviewable advice for all creator niches", () => {
    expect(CREATOR_NICHES).toHaveLength(8);
    for (const niche of CREATOR_NICHES) expect(NICHE_TIPS[niche].length).toBeGreaterThan(0);
    expect(JSON.stringify(NICHE_TIPS)).not.toMatch(/views|revenue|earnings/i);
  });
  it("saves a user's niche behind the Home tips flag and withholds YouTube results", async () => {
    state.session = sessionFor("own_niche", "org_niche") as Session;
    const route = await import("../src/app/api/home-inspiration/route");
    delete process.env.IZWI_FLAG_HOME_TIPS;
    expect((await call(route.GET, "GET", "/api/home-inspiration")).status).toBe(404);
    process.env.IZWI_FLAG_HOME_TIPS = "1";
    const result = await call(route.GET, "GET", "/api/home-inspiration");
    expect(result.data).toMatchObject({ youtubeConnected: false, inspiration: [] });
    expect((await call(route.PATCH, "PATCH", "/api/home-inspiration", { json: { niche: "cooking" } })).status).toBe(200);
    expect((await call(route.GET, "GET", "/api/home-inspiration")).data).toMatchObject({ niche: "cooking" });
  });
});
