// Every API route, asked the four questions that matter: signed out, from another site, for another workspace's ids,
// and as a plain member. Only better-auth's session lookup is replaced; the handlers, guards and database are real.
// A completeness check fails when a route or method is added without appearing here.
import "./helpers/testdb";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { call, sessionFor } from "./helpers/api";

const hoisted = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("../src/server/auth", () => ({ auth: { api: { getSession: async () => hoisted.session } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const API = path.resolve(__dirname, "..", "src", "app", "api");

// route folder → methods → what signed-out callers get. "public" routes are checked separately.
type Entry = { path: string; params: Record<string, string>; methods: Record<string, { json?: unknown }>; kind: "session" | "public" | "hosted-only" | "library" | "tus" };
const A = { project: "prj_a", clip: "clp_a", line: "ln_a", track: "trk_a", person: "per_a", link: "lnk_a", output: "out_a", listing: "lst_a", enquiry: "enq_a", comment: "cmt_a", job: "job_a", provider: "prv_a", plan: "pln_a", asset: "ast_a" };
const ROUTES: Entry[] = [
  { path: "auth/[...all]", params: {}, methods: { GET: {}, POST: {} }, kind: "library" },
  { path: "glossary", params: {}, methods: { POST: { json: { term: "Thabiso" } } }, kind: "session" },
  { path: "home-inspiration", params: {}, methods: { GET: {}, PATCH: { json: { niche: "podcast" } } }, kind: "session" },
  { path: "items/[kind]/[id]", params: { kind: "clip", id: A.clip }, methods: { GET: {}, PATCH: { json: { status: "dropped" } }, DELETE: {} }, kind: "session" },
  { path: "media/[id]", params: { id: A.asset }, methods: { GET: {} }, kind: "session" },
  { path: "plan", params: {}, methods: { GET: {}, POST: { json: { projectId: A.project, prompt: "make three clips" } } }, kind: "session" },
  { path: "plan/[id]", params: { id: A.plan }, methods: { POST: { json: { action: "approve" } } }, kind: "session" },
  { path: "post-schedules", params: {}, methods: { GET: {}, POST: { json: { outputId: "out_a", platform: "youtube", scheduledAt: Date.now() + 3600000, timezone: "Africa/Johannesburg", title: "x", description: "", tags: [], acknowledgeReview: false } } }, kind: "session" },
  { path: "policy-check", params: {}, methods: { GET: {}, POST: { json: { outputId: "out_a", platforms: ["youtube"] } } }, kind: "session" },
  { path: "projects", params: {}, methods: { GET: {}, POST: { json: { title: "x", kind: "podcast" } } }, kind: "session" },
  { path: "projects/[id]", params: { id: A.project }, methods: { GET: {}, PATCH: { json: { title: "x" } }, DELETE: {} }, kind: "session" },
  { path: "projects/[id]/[action]", params: { id: A.project, action: "declare" }, methods: { POST: { json: {} } }, kind: "session" },
  { path: "projects/[id]/assistant", params: { id: A.project }, methods: { GET: {}, POST: { json: { providerId: A.provider, text: "hi" } } }, kind: "session" },
  { path: "projects/[id]/assistant/transcribe", params: { id: A.project }, methods: { POST: {} }, kind: "session" },
  { path: "settings/preferences", params: {}, methods: { GET: {}, PATCH: { json: { theme: "warm", accent: "forest", fontPair: "clean", textSize: "large", reducedMotion: true } } }, kind: "session" },
  { path: "settings/languages", params: {}, methods: { GET: {}, PATCH: { json: { languages: ["zu", "en"] } } }, kind: "session" },
  { path: "providers", params: {}, methods: { GET: {}, POST: { json: { kind: "openai_compat", label: "x", baseUrl: "https://x.example.test/v1", model: "m", roles: ["plan"] } } }, kind: "session" },
  { path: "providers/models", params: {}, methods: { POST: { json: { kind: "openai_compat", baseUrl: "https://x.example.test/v1" } } }, kind: "session" },
  { path: "providers/[id]", params: { id: A.provider }, methods: { PATCH: { json: { label: "taken" } }, POST: {}, DELETE: {} }, kind: "session" },
  { path: "providers/[id]/models", params: { id: A.provider }, methods: { GET: {} }, kind: "session" },
  { path: "providers/routes", params: {}, methods: { GET: {}, PUT: { json: { routes: [] } } }, kind: "session" },
  { path: "public/consent/[token]", params: { token: "z".repeat(32) }, methods: { GET: {}, POST: { json: { decision: "grant", name: "x" } } }, kind: "public" },
  { path: "public/listing/[slug]", params: { slug: "no-such-clip" }, methods: { GET: {}, POST: { json: { name: "x", contact: "x@example.test", use: "a long enough use" } } }, kind: "public" },
  { path: "public/review/[token]", params: { token: "z".repeat(32) }, methods: { GET: {}, POST: { json: { action: "decision", author: "x", decision: "approve" } } }, kind: "public" },
  { path: "system", params: {}, methods: { GET: {} }, kind: "session" },
  { path: "starter-templates", params: {}, methods: { GET: {} }, kind: "session" },
  { path: "team", params: {}, methods: { GET: {}, POST: { json: { email: "x@example.test" } } }, kind: "session" },
  { path: "upload/[[...tus]]", params: {}, methods: { GET: {}, POST: {}, PATCH: {}, HEAD: {}, DELETE: {}, OPTIONS: {} }, kind: "tus" },
  { path: "upload/s3", params: {}, methods: { POST: { json: { projectId: A.project, filename: "a.mp4", size: 1 } } }, kind: "hosted-only" },
  { path: "upload/s3/[id]", params: { id: "up_x" }, methods: { GET: {}, DELETE: {} }, kind: "hosted-only" },
  { path: "upload/s3/[id]/part", params: { id: "up_x" }, methods: { POST: { json: { partNumber: 1 } } }, kind: "hosted-only" },
  { path: "upload/s3/[id]/complete", params: { id: "up_x" }, methods: { POST: {} }, kind: "hosted-only" },
  { path: "workspace", params: {}, methods: { GET: {}, PATCH: { json: { device: "phone" } }, POST: { json: { name: "Studio" } } }, kind: "session" },
  { path: "workspace/audit", params: {}, methods: { GET: {} }, kind: "session" },
];

const url = (e: Entry, params = e.params) => `/api/${e.path.replace(/\[\[?\.\.\.[a-z]+\]?\]/, "").replace(/\[([a-z]+)\]/g, (_m, k: string) => params[k] ?? k)}`;
const load = async (e: Entry) => (await import(/* @vite-ignore */ `../src/app/api/${e.path}/route.ts`)) as Record<string, unknown>;
const writes = (m: string) => !["GET", "HEAD", "OPTIONS"].includes(m);

let db: Db;
beforeAll(async () => {
  process.env.IZWI_FLAG_ASSISTANT = "1";
  process.env.IZWI_FLAG_PREFERENCES = "1";
  process.env.IZWI_FLAG_LANGUAGES = "1";
  process.env.IZWI_FLAG_POLICY_PRECHECK = "1";
  process.env.IZWI_FLAG_STARTER_TEMPLATES = "1";
  process.env.IZWI_FLAG_SCHEDULED_POSTS = "1";
  process.env.IZWI_FLAG_HOME_TIPS = "1";
  db = await openTestDb();
  await db.execScript(`CREATE TABLE IF NOT EXISTS invitation (id TEXT PRIMARY KEY, "organizationId" TEXT, email TEXT, role TEXT, status TEXT, "expiresAt" TEXT)`);
  await seedWorkspace(db, "org_a", "own_a", A.project);
  await seedWorkspace(db, "org_b", "own_b", "prj_b");
  for (const [user, role] of [["mem_a", "member"], ["adm_a", "admin"]]) {
    await db.run(`INSERT INTO "user" (id) VALUES (?)`, user);
    await db.run(`INSERT INTO member (id, "organizationId", "userId", role) VALUES (?, 'org_a', ?, ?)`, `m_${user}`, user, role);
  }
  const sql = [
    `INSERT INTO workspace_pref (workspace_id, created_at, updated_at) VALUES ('org_a', 0, 0)`,
    `INSERT INTO asset (id,workspace_id,project_id,kind,storage_key,filename,mime,bytes,duration_ms,created_at) VALUES ('${A.asset}','org_a','${A.project}','source','org_a/prj_a/a.mp4','a.mp4','video/mp4',1,60000,0)`,
    `INSERT INTO clip (id,workspace_id,project_id,title,start_ms,end_ms,reason,origin,status,created_at,updated_at) VALUES ('${A.clip}','org_a','${A.project}','Clip',0,4000,'r','manual','kept',0,0)`,
    `INSERT INTO caption_track (id,workspace_id,project_id,language,kind,status,engine,created_at,updated_at) VALUES ('${A.track}','org_a','${A.project}','en','source','draft','t',0,0)`,
    `INSERT INTO caption_line (id,track_id,idx,start_ms,end_ms,text) VALUES ('${A.line}','${A.track}',0,0,1000,'Private words')`,
    `INSERT INTO person (id,workspace_id,project_id,name,role,created_at) VALUES ('${A.person}','org_a','${A.project}','Guest','guest',0)`,
    `INSERT INTO share_link (id,workspace_id,project_id,purpose,token_hash,expires_at,created_by,created_at) VALUES ('${A.link}','org_a','${A.project}','review','hash_a',9999999999999,'own_a',0)`,
    `INSERT INTO job (id,workspace_id,project_id,type,status,run_after,created_at) VALUES ('${A.job}','org_a','${A.project}','package','queued',9999999999999,0)`,
    `INSERT INTO output (id,workspace_id,project_id,clip_id,preset,status,created_by,created_at,updated_at) VALUES ('${A.output}','org_a','${A.project}','${A.clip}','small','ready','own_a',0,0)`,
    `INSERT INTO listing (id,workspace_id,project_id,clip_id,slug,title,created_at,updated_at) VALUES ('${A.listing}','org_a','${A.project}','${A.clip}','a-listing','L',0,0)`,
    `INSERT INTO enquiry (id,workspace_id,listing_id,name,contact,intended_use,created_at) VALUES ('${A.enquiry}','org_a','${A.listing}','N','c@example.test','use',0)`,
    `INSERT INTO comment (id,workspace_id,project_id,author,body,created_at) VALUES ('${A.comment}','org_a','${A.project}','A','note',0)`,
    `INSERT INTO provider (id,workspace_id,kind,label,base_url,model,roles,last_test_ok,created_by,created_at) VALUES ('${A.provider}','org_a','openai_compat','P','https://p.example.test/v1','m','["chat"]',1,'own_a',0)`,
    `INSERT INTO plan_run (id,workspace_id,project_id,prompt,planner,steps,status,created_by,created_at) VALUES ('${A.plan}','org_a','${A.project}','p','rules','[]','proposed','own_a',0)`,
  ];
  for (const s of sql) await db.run(s);
}, 60_000);
afterAll(async () => { delete process.env.IZWI_FLAG_PREFERENCES; delete process.env.IZWI_FLAG_LANGUAGES; delete process.env.IZWI_FLAG_POLICY_PRECHECK; delete process.env.IZWI_FLAG_STARTER_TEMPLATES; delete process.env.IZWI_FLAG_SCHEDULED_POSTS; delete process.env.IZWI_FLAG_HOME_TIPS; await closeTestDb(db); });
beforeEach(() => { hoisted.session = null; });

const TABLES = ["project", "asset", "clip", "caption_track", "caption_line", "person", "share_link", "job", "output", "listing", "enquiry", "comment", "provider", "plan_run", "declaration", "consent", "model_route", "workspace_pref"];
const rowsOfA = async () => {
  const out: string[] = [];
  for (const t of TABLES) {
    const where = t === "caption_line" ? `track_id = '${A.track}'` : `workspace_id = 'org_a'`;
    out.push(`${t}:${JSON.stringify(await db.all(`SELECT * FROM ${t} WHERE ${where} ORDER BY 1`))}`);
  }
  return out.join("\n");
};

it("this table names every route file and method", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const found = walk(API).filter((f) => f.endsWith("route.ts")).map((f) => {
    const src = readFileSync(f, "utf8");
    const methods = [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|handler as (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|export const \{ ([A-Z, ]+) \}/g)]
      .flatMap((m) => (m[3] ? m[3].split(",").map((s) => s.trim()) : [m[1] ?? m[2]]));
    return `${path.relative(API, path.dirname(f)).split(path.sep).join("/")} ${[...new Set(methods)].sort().join(",")}`;
  }).sort();
  expect(found).toEqual(ROUTES.map((e) => `${e.path} ${Object.keys(e.methods).sort().join(",")}`).sort());
});

describe("signed out", () => {
  for (const e of ROUTES.filter((r) => r.kind === "session")) {
    for (const [method, o] of Object.entries(e.methods)) {
      it(`${method} /api/${e.path} answers 401`, async () => {
        const mod = await load(e);
        const r = await call(mod[method], method, url(e), { params: e.params, json: o.json });
        expect(r.status).toBe(401);
      });
    }
  }
  it("resumable uploads refuse to start", async () => {
    const mod = await load(ROUTES.find((e) => e.kind === "tus")!);
    const r = await call(mod.POST, "POST", "/api/upload", { headers: { "tus-resumable": "1.0.0", "upload-length": "10" } });
    expect(r.status).toBe(401);
  });
  it("the hosted upload routes do not exist on local storage", async () => {
    for (const e of ROUTES.filter((r) => r.kind === "hosted-only")) {
      const mod = await load(e);
      for (const [method, o] of Object.entries(e.methods)) {
        expect((await call(mod[method], method, url(e), { params: e.params, json: o.json })).status, `${method} ${e.path}`).toBe(404);
      }
    }
  });
  it("public links that do not exist answer 404 without detail", async () => {
    for (const e of ROUTES.filter((r) => r.kind === "public")) {
      const mod = await load(e);
      for (const [method, o] of Object.entries(e.methods)) {
        const r = await call(mod[method], method, url(e), { params: e.params, json: o.json });
        expect(r.status, `${method} ${e.path}`).toBe(404);
        expect(r.text).not.toMatch(/at |\.ts:\d/);
      }
    }
  });
});

describe("from another site", () => {
  for (const e of ROUTES.filter((r) => ["session", "public", "hosted-only"].includes(r.kind))) {
    for (const [method, o] of Object.entries(e.methods).filter(([m]) => writes(m))) {
      it(`${method} /api/${e.path} is refused, signed in or not`, async () => {
        hoisted.session = sessionFor("own_a", "org_a");
        const mod = await load(e);
        for (const origin of ["https://evil.example", null]) {
          const r = await call(mod[method], method, url(e), { params: e.params, json: o.json, origin });
          expect(r.status, String(origin)).toBe(403);
        }
      });
    }
  }
});

describe("another workspace's ids", () => {
  const ids: [string, string, Record<string, string>, unknown?][] = [
    ["projects/[id]", "GET", { id: A.project }], ["projects/[id]", "PATCH", { id: A.project }, { title: "taken" }], ["projects/[id]", "DELETE", { id: A.project }],
    ...["run", "clips", "people", "consent", "declare", "links", "comments", "outputs", "listings"].map((action): [string, string, Record<string, string>, unknown] => ["projects/[id]/[action]", "POST", { id: A.project, action }, {
      run: { type: "package" }, clips: { title: "t", startMs: 0, endMs: 2000 }, people: { name: "n", role: "r" }, consent: { personId: A.person }, declare: {},
      links: {}, comments: { atMs: 0, body: "b" }, outputs: { clipId: A.clip, preset: "small", language: null }, listings: { clipId: A.clip, title: "t" },
    }[action]]),
    ["projects/[id]/assistant", "GET", { id: A.project }], ["projects/[id]/assistant", "POST", { id: A.project }, { providerId: A.provider, text: "hi" }],
    ["projects/[id]/assistant/transcribe", "POST", { id: A.project }],
    ["items/[kind]/[id]", "GET", { kind: "track", id: A.track }], ["items/[kind]/[id]", "PATCH", { kind: "track", id: A.track }, { approveAll: true }],
    ["items/[kind]/[id]", "PATCH", { kind: "clip", id: A.clip }, { status: "dropped" }], ["items/[kind]/[id]", "PATCH", { kind: "line", id: A.line }, { text: "taken" }],
    ["items/[kind]/[id]", "PATCH", { kind: "output", id: A.output }, { platform: "x" }], ["items/[kind]/[id]", "PATCH", { kind: "listing", id: A.listing }, { enabled: false }],
    ["items/[kind]/[id]", "PATCH", { kind: "enquiry", id: A.enquiry }, { status: "closed" }], ["items/[kind]/[id]", "PATCH", { kind: "comment", id: A.comment }, { resolved: true }],
    ["items/[kind]/[id]", "PATCH", { kind: "job", id: A.job }, { action: "cancel" }], ["items/[kind]/[id]", "DELETE", { kind: "person", id: A.person }],
    ["items/[kind]/[id]", "DELETE", { kind: "link", id: A.link }], ["items/[kind]/[id]", "DELETE", { kind: "output", id: A.output }],
    ["media/[id]", "GET", { id: A.asset }],
    ["plan", "POST", {}, { projectId: A.project, prompt: "make three clips" }], ["plan/[id]", "POST", { id: A.plan }, { action: "approve" }], ["plan/[id]", "POST", { id: A.plan }, { action: "dismiss" }],
    ["providers/[id]", "PATCH", { id: A.provider }, { label: "taken" }], ["providers/[id]", "POST", { id: A.provider }], ["providers/[id]", "DELETE", { id: A.provider }],
    ["providers/[id]/models", "GET", { id: A.provider }],
    ["providers/routes", "PUT", {}, { routes: [{ role: "chat", providerId: A.provider, model: "m" }] }],
  ];
  it("are refused and change nothing", async () => {
    const before = await rowsOfA();
    hoisted.session = sessionFor("own_b", "org_b");
    const leaks: string[] = [];
    for (const [route, method, params, json] of ids) {
      const e = ROUTES.find((r) => r.path === route)!;
      const mod = await load(e);
      const form = route.endsWith("transcribe") ? new FormData() : undefined;
      const r = await call(mod[method], method, url(e, params), { params, json, body: form });
      // 404 is the rule. A job or a render answers 409 ("already finished"), and dismissing a plan answers ok without
      // touching it; the unchanged-rows check below covers those three.
      const allowed = params.kind === "job" || (method === "DELETE" && params.kind === "output") ? [404, 409]
        : (json as { action?: string } | undefined)?.action === "dismiss" ? [200] : route === "providers/routes" ? [400] : [404];
      if (!allowed.includes(r.status)) leaks.push(`${method} ${url(e, params)} → ${r.status} ${r.text.slice(0, 120)}`);
      expect(r.text).not.toContain("Private words");
    }
    expect(leaks).toEqual([]);
    expect(await rowsOfA()).toBe(before);
  });
  it("include a half-finished upload, which cannot be read, continued or removed", async () => {
    await db.run(`INSERT INTO upload_session (upload_id, workspace_id, project_id, user_id, filename, created_at) VALUES ('upl_a', 'org_a', ?, 'own_a', 'a.mp4', 0)`, A.project);
    hoisted.session = sessionFor("own_b", "org_b");
    const mod = await load(ROUTES.find((e) => e.kind === "tus")!);
    const tus = { "tus-resumable": "1.0.0" };
    for (const [method, headers] of [["HEAD", tus], ["PATCH", { ...tus, "upload-offset": "0", "content-type": "application/offset+octet-stream" }], ["DELETE", tus]] as const) {
      expect((await call(mod[method], method, "/api/upload/upl_a", { headers })).status, method).toBe(404);
    }
    expect(await db.one(`SELECT finished_at FROM upload_session WHERE upload_id = 'upl_a'`)).toEqual({ finished_at: null });
  });
  it("never appear in the other workspace's lists", async () => {
    hoisted.session = sessionFor("own_b", "org_b");
    for (const route of ["projects", "providers", "providers/routes", "system", "team"]) {
      const e = ROUTES.find((r) => r.path === route)!;
      const r = await call((await load(e)).GET, "GET", url(e));
      expect(r.status, route).toBe(200);
      expect(r.text, route).not.toContain("_a\"");
    }
  });
});

describe("roles", () => {
  const adminOnly: [string, string, Record<string, string>, unknown?][] = [
    ["projects/[id]", "DELETE", { id: A.project }],
    ["providers", "POST", {}, { kind: "openai_compat", label: "x", baseUrl: "https://x.example.test/v1", model: "m", roles: ["plan"] }],
    ["providers/models", "POST", {}, { kind: "openai_compat", baseUrl: "https://x.example.test/v1" }],
    ["providers/[id]", "PATCH", { id: A.provider }, { label: "taken" }], ["providers/[id]", "POST", { id: A.provider }], ["providers/[id]", "DELETE", { id: A.provider }],
    ["providers/[id]/models", "GET", { id: A.provider }], ["providers/routes", "PUT", {}, { routes: [] }],
    ["team", "POST", {}, { email: "x@example.test", role: "admin" }], ["workspace/audit", "GET", {}],
    ["items/[kind]/[id]", "DELETE", { kind: "person", id: A.person }],
    ["projects/[id]/[action]", "POST", { id: A.project, action: "consent" }, { personId: A.person }],
  ];
  it("a member cannot do what is for owners and admins", async () => {
    const before = await rowsOfA();
    hoisted.session = sessionFor("mem_a", "org_a");
    for (const [route, method, params, json] of adminOnly) {
      const e = ROUTES.find((r) => r.path === route)!;
      const r = await call((await load(e))[method], method, url(e, params), { params, json });
      expect(r.status, `${method} ${route}`).toBe(403);
    }
    expect(await rowsOfA()).toBe(before);
  });
  it("tells the studio who may manage consent", async () => {
    const e = ROUTES.find((r) => r.path === "projects/[id]")!;
    const GET = (await load(e)).GET;
    for (const [user, may] of [["mem_a", false], ["adm_a", true], ["own_a", true]] as const) {
      hoisted.session = sessionFor(user, "org_a");
      const r = await call(GET, "GET", url(e), { params: e.params });
      expect((JSON.parse(r.text) as { canManageConsent?: boolean }).canManageConsent, user).toBe(may);
    }
  });
  it("the audit trail is for the owner alone", async () => {
    const e = ROUTES.find((r) => r.path === "workspace/audit")!;
    hoisted.session = sessionFor("adm_a", "org_a");
    expect((await call((await load(e)).GET, "GET", url(e))).status).toBe(403);
    hoisted.session = sessionFor("own_a", "org_a");
    expect((await call((await load(e)).GET, "GET", url(e))).status).toBe(200);
  });
  it("someone removed from the workspace is refused", async () => {
    hoisted.session = sessionFor("own_b", "org_a");
    const e = ROUTES.find((r) => r.path === "projects")!;
    expect((await call((await load(e)).GET, "GET", url(e))).status).toBe(403);
  });
});

describe("bad input", () => {
  it("answers 400 or 413 with a readable error, never a stack trace", async () => {
    hoisted.session = sessionFor("own_a", "org_a");
    const e = ROUTES.find((r) => r.path === "projects")!;
    const mod = await load(e);
    const notJson = await call(mod.POST, "POST", url(e), { body: "{", headers: { "content-type": "application/json" } });
    const wrong = await call(mod.POST, "POST", url(e), { json: { title: "", kind: "x" } });
    const huge = await call(mod.POST, "POST", url(e), { json: { title: "x".repeat(70_000), kind: "podcast" } });
    expect([notJson.status, wrong.status, huge.status]).toEqual([400, 400, 413]);
    for (const r of [notJson, wrong, huge]) expect(r.text).not.toMatch(/node_modules|\.ts:\d/);
  });
  it("the assistant is a 404 when switched off, before the session is read", async () => {
    process.env.IZWI_FLAG_ASSISTANT = "0";
    try {
      for (const route of ["projects/[id]/assistant", "projects/[id]/assistant/transcribe"]) {
        const e = ROUTES.find((r) => r.path === route)!;
        const mod = await load(e);
        for (const method of Object.keys(e.methods)) expect((await call(mod[method], method, url(e), { params: e.params })).status, `${method} ${route}`).toBe(404);
      }
    } finally { process.env.IZWI_FLAG_ASSISTANT = "1"; }
  });
});
