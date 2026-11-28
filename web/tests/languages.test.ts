import "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { call, sessionFor, type Session } from "./helpers/api";
import { GREETINGS, greetingFor } from "../src/lib/greetings";

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("../src/server/auth", () => ({ auth: { api: { getSession: async () => state.session } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

let db: Db;
beforeAll(async () => { db = await openTestDb(); await seedWorkspace(db, "org_lang", "own_lang", "prj_lang"); });
afterAll(async () => { delete process.env.IZWI_FLAG_LANGUAGES; await closeTestDb(db); });

describe("creator greeting languages", () => {
  it("keeps each standard greeting in the reviewed-language catalogue", () => {
    expect(GREETINGS).toHaveLength(12);
    expect(GREETINGS.every((item) => item.review === "Needs native-speaker review")).toBe(true);
    expect(greetingFor(["zu"], "2026-01-01").text).toBe("Sawubona");
    expect(greetingFor(["af"], "2026-01-01").text).toBe("Hallo");
  });
  it("keeps the route off by default and saves only the selected user's languages", async () => {
    delete process.env.IZWI_FLAG_LANGUAGES;
    state.session = sessionFor("own_lang", "org_lang") as Session;
    const route = await import("../src/app/api/settings/languages/route");
    expect((await call(route.GET, "GET", "/api/settings/languages")).status).toBe(404);
    process.env.IZWI_FLAG_LANGUAGES = "1";
    expect((await call(route.GET, "GET", "/api/settings/languages")).data).toMatchObject({ languages: ["en"] });
    expect((await call(route.PATCH, "PATCH", "/api/settings/languages", { json: { languages: ["zu", "xh", "zu"] } })).status).toBe(200);
    expect((await call(route.GET, "GET", "/api/settings/languages")).data).toMatchObject({ languages: ["zu", "xh"] });
    expect((await call(route.PATCH, "PATCH", "/api/settings/languages", { json: { languages: ["bad"] } })).status).toBe(400);
  });
});
