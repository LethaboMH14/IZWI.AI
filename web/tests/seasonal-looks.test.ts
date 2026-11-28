import "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { call, sessionFor, type Session } from "./helpers/api";
import { seasonalSuggestion } from "../src/lib/seasonal-calendar";

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("../src/server/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
let db: Db;
beforeAll(async () => { db = await openTestDb(); await seedWorkspace(db, "org_season", "own_season", "prj_season"); });
afterAll(async () => { delete process.env.IZWI_FLAG_SEASONAL_LOOKS; await closeTestDb(db); });

describe("opt-in seasonal ideas", () => {
  it("uses specific South African calendar dates and a no-purple palette", () => {
    expect(seasonalSuggestion(new Date("2026-09-24T10:00:00Z")).id).toBe("heritage-day");
    expect(seasonalSuggestion(new Date("2026-06-16T10:00:00Z")).id).toBe("youth-day");
    expect(seasonalSuggestion(new Date("2026-08-09T10:00:00Z")).id).toBe("womens-day");
  });
  it("shows nothing until opted in and applies a look only after explicit acceptance", async () => {
    process.env.IZWI_FLAG_SEASONAL_LOOKS = "1"; state.session = sessionFor("own_season", "org_season") as Session;
    const settings = await import("../src/app/api/settings/seasonal/route");
    const suggestions = await import("../src/app/api/seasonal-suggestions/route");
    expect((await call(suggestions.GET, "GET", "/api/seasonal-suggestions")).data).toMatchObject({ enabled: false });
    const first = await call(suggestions.POST, "POST", "/api/seasonal-suggestions", { json: { seasonalId: seasonalSuggestion().id, action: "accept" } });
    expect(first.status).toBe(403);
    expect((await call(settings.PATCH, "PATCH", "/api/settings/seasonal", { json: { enabled: true } })).data).toMatchObject({ enabled: true });
    const before = await db.one<{ theme: string; accent: string }>("SELECT theme, accent FROM user_preferences WHERE user_id = 'own_season'");
    expect(before).toMatchObject({ theme: "approved", accent: "amber" });
    const accepted = await call(suggestions.POST, "POST", "/api/seasonal-suggestions", { json: { seasonalId: seasonalSuggestion().id, action: "accept" } });
    expect(accepted.data).toMatchObject({ status: "accepted", applied: true });
    expect(await db.one<{ result: string }>("SELECT result FROM seasonal_proposal WHERE user_id = 'own_season'")).toEqual({ result: "accepted" });
    expect(await db.one<{ theme: string; accent: string }>("SELECT theme, accent FROM user_preferences WHERE user_id = 'own_season'")).toMatchObject({ theme: seasonalSuggestion().theme, accent: seasonalSuggestion().accent });
    await call(settings.PATCH, "PATCH", "/api/settings/seasonal", { json: { enabled: false } });
    expect((await call(suggestions.GET, "GET", "/api/seasonal-suggestions")).data).toMatchObject({ enabled: false });
  });
});
