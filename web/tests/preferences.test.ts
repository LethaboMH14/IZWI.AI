import "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { call, sessionFor, type Session } from "./helpers/api";

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("../src/server/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

let db: Db;
beforeAll(async () => {
  db = await openTestDb();
  await seedWorkspace(db, "org_preferences", "own_preferences", "prj_preferences");
  await db.run(`INSERT INTO "user" (id) VALUES ('mem_preferences')`);
  await db.run(`INSERT INTO member (id, "organizationId", "userId", role) VALUES ('mem_membership', 'org_preferences', 'mem_preferences', 'member')`);
});
afterAll(async () => { delete process.env.IZWI_FLAG_PREFERENCES; await closeTestDb(db); });

describe("per-user Preferences settings", () => {
  it("is hidden when the server flag is off", async () => {
    delete process.env.IZWI_FLAG_PREFERENCES;
    state.session = sessionFor("own_preferences", "org_preferences") as Session;
    const route = await import("../src/app/api/settings/preferences/route");
    expect((await call(route.GET, "GET", "/api/settings/preferences")).status).toBe(404);
  });

  it("saves the appearance to the signed-in user only", async () => {
    process.env.IZWI_FLAG_PREFERENCES = "1";
    const route = await import("../src/app/api/settings/preferences/route");
    state.session = sessionFor("own_preferences", "org_preferences") as Session;
    const get = () => call(route.GET, "GET", "/api/settings/preferences");
    const patch = (json: unknown) => call(route.PATCH, "PATCH", "/api/settings/preferences", { json });
    expect((await get()).data).toEqual({ theme: "approved", accent: "amber", fontPair: "project", textSize: "standard", reducedMotion: false });
    expect((await patch({ theme: "warm", accent: "forest", fontPair: "clean", textSize: "large", reducedMotion: true })).status).toBe(200);
    expect((await get()).data).toEqual({ theme: "warm", accent: "forest", fontPair: "clean", textSize: "large", reducedMotion: true });
    state.session = sessionFor("mem_preferences", "org_preferences") as Session;
    expect((await get()).data).toEqual({ theme: "approved", accent: "amber", fontPair: "project", textSize: "standard", reducedMotion: false });
    expect((await patch({ theme: "purple", accent: "amber", fontPair: "project", textSize: "standard", reducedMotion: false })).status).toBe(400);
  });
});
