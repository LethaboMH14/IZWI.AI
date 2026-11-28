// Defects found in the 28 Nov QA pass, each driven through the real route handler.
import "./helpers/testdb";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { call, sessionFor, type Session } from "./helpers/api";

const hoisted = vi.hoisted(() => ({ session: null as unknown, inviteError: null as unknown, previewModels: false, previewAuth: "" }));
vi.mock("../src/server/auth", () => ({ auth: { api: { getSession: async () => hoisted.session, createInvitation: async () => { throw hoisted.inviteError; } } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("../src/server/media", async (load) => ({
  ...(await load<typeof import("../src/server/media")>()),
  probe: vi.fn(async () => ({ hasAudio: true, hasVideo: false, durationMs: 2000, format: "wav" })),
  ffmpeg: vi.fn(async () => undefined),
  whisper: vi.fn(async () => ({ language: "en", engine: "test", segments: [{ startMs: 0, endMs: 1000, text: "make a clip", words: [] }] })),
}));
vi.mock("../src/server/sdk-fetch", async (load) => {
  const actual = await load<typeof import("../src/server/sdk-fetch")>();
  return { ...actual, sdkFetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.toString() : input;
    if (hoisted.previewModels && url === "http://127.0.0.1:11434/v1/models") {
      hoisted.previewAuth = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({ data: [{ id: "llama3.1:8b" }, { id: "qwen3:1.7b" }] });
    }
    return actual.sdkFetch(input, init);
  } };
});

let db: Db;
let provider: Server;
let providerUrl = "";
const seen: { path: string; auth: string | undefined }[] = [];

beforeAll(async () => {
  process.env.IZWI_FLAG_ASSISTANT = "1";
  db = await openTestDb();
  await db.execScript(`CREATE TABLE IF NOT EXISTS invitation (id TEXT PRIMARY KEY, "organizationId" TEXT, email TEXT, role TEXT, status TEXT, "expiresAt" TEXT)`);
  // A stand-in provider on this machine: a model list, and an endpoint that refuses its key.
  provider = createServer((req, res) => {
    seen.push({ path: req.url ?? "", auth: req.headers.authorization });
    if (req.url === "/v1/chat/completions") {
      // A model that "translates" one line and hands the others back unchanged.
      const content = JSON.stringify({ lines: [{ i: 0, t: "Siyakwamukela futhi ohlelweni lwethu" }, { i: 1, t: "Thanks for having me, friend." }, { i: 2, t: "Sharp sharp" }] });
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })); return;
    }
    if (req.url === "/v1/models") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ data: [{ id: "llama3.1:8b" }, { id: "qwen3:1.7b" }] })); return; }
    res.writeHead(401); res.end();
  });
  await new Promise<void>((r) => provider.listen(0, "127.0.0.1", () => r()));
  providerUrl = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
}, 60_000);
afterAll(async () => { provider.close(); await closeTestDb(db); });

let n = 0;
async function workspace() {
  const k = ++n, ws = `org_api${k}`, owner = `own_api${k}`, member = `mem_api${k}`, prj = `prj_api${k}`;
  await seedWorkspace(db, ws, owner, prj);
  await db.run(`INSERT INTO "user" (id) VALUES (?)`, member);
  await db.run(`INSERT INTO member (id, "organizationId", "userId", role) VALUES (?, ?, ?, 'member')`, `m_${member}`, ws, member);
  const as = (who: "owner" | "member") => { hoisted.session = sessionFor(who === "owner" ? owner : member, ws) as Session; };
  as("owner");
  return { ws, owner, member, prj, as };
}
async function addProvider(ws: string, owner: string, id: string, kind: string, baseUrl: string, key: string | null) {
  const { seal } = await import("../src/server/crypto");
  await db.run(`INSERT INTO provider (id, workspace_id, kind, label, base_url, model, key_sealed, key_hint, roles, last_test_ok, last_test_at, created_by, created_at) VALUES (?, ?, ?, 'P', ?, 'llama3.1:8b', ?, ?, '["chat"]', 1, 1, ?, 1)`,
    id, ws, kind, baseUrl, key ? seal(key) : null, key ? "set" : null, owner);
}

describe("projects", () => {
  it("renaming keeps the spoken language", async () => {
    const w = await workspace();
    await db.run(`UPDATE project SET spoken_language = 'zu' WHERE id = ?`, w.prj);
    const route = await import("../src/app/api/projects/[id]/route");
    expect((await call(route.PATCH, "PATCH", `/api/projects/${w.prj}`, { params: { id: w.prj }, json: { title: "New name" } })).status).toBe(200);
    expect(await db.one(`SELECT title, spoken_language FROM project WHERE id = ?`, w.prj)).toEqual({ title: "New name", spoken_language: "zu" });
  });
});

describe("job controls", () => {
  it("cancelling a finished step says so, and cancelling a queued render marks its output", async () => {
    const w = await workspace();
    const route = await import("../src/app/api/items/[kind]/[id]/route");
    const { enqueue } = await import("../src/server/jobs");
    const job = await enqueue({ workspaceId: w.ws, projectId: w.prj, type: "render", input: { outputId: "out_c" } });
    await db.run(`INSERT INTO output (id, workspace_id, project_id, preset, status, job_id, created_by, created_at, updated_at) VALUES ('out_c', ?, ?, 'small', 'queued', ?, ?, 0, 0)`, w.ws, w.prj, job.id, w.owner);
    const cancel = () => call(route.PATCH, "PATCH", `/api/items/job/${job.id}`, { params: { kind: "job", id: job.id }, json: { action: "cancel" } });
    const first = await cancel();
    expect(first).toMatchObject({ status: 200, data: { ok: true } });
    expect(await db.one(`SELECT status, note FROM output WHERE id = 'out_c'`)).toEqual({ status: "failed", note: "Cancelled." });
    expect((await cancel()).status).toBe(409);
  });
});

describe("checking a held render again", () => {
  it("says why it is still held", async () => {
    const w = await workspace();
    const route = await import("../src/app/api/items/[kind]/[id]/route");
    await db.run(`INSERT INTO job (id, workspace_id, project_id, type, status, input, error, run_after, created_at) VALUES ('job_held', ?, ?, 'render', 'blocked', '{"outputId":"out_none"}', 'Waiting on Demo Guest (requested).', 0, 0)`, w.ws, w.prj);
    const r = await call(route.PATCH, "PATCH", "/api/items/job/job_held", { params: { kind: "job", id: "job_held" }, json: { action: "retry" } });
    expect(r.status).toBe(409);
    expect(r.text).toContain("Still held. Waiting on Demo Guest");
  });
});

describe("team", () => {
  it("only owners and admins receive invite links", async () => {
    const w = await workspace();
    await db.run(`INSERT INTO invitation VALUES ('inv_secret', ?, 'new@example.test', 'admin', 'pending', '2027-01-01')`, w.ws);
    const route = await import("../src/app/api/team/route");
    const asOwner = await call(route.GET, "GET", "/api/team");
    expect(asOwner.text).toContain("/invite/inv_secret");
    w.as("member");
    const asMember = await call(route.GET, "GET", "/api/team");
    expect(asMember.status).toBe(200);
    expect(asMember.text).not.toContain("inv_secret");
  });

  it("says why an invite was refused instead of reporting a server fault", async () => {
    await workspace();
    const route = await import("../src/app/api/team/route");
    const { APIError } = await import("better-auth/api");
    const ask = async (code: string) => {
      hoisted.inviteError = APIError.from("BAD_REQUEST", { code, message: "library wording" });
      const r = await call(route.POST, "POST", "/api/team", { json: { email: "again@example.test" } });
      return [r.status, (JSON.parse(r.text) as { error: string }).error];
    };
    expect(await ask("USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION")).toEqual([400, "That person is already in this workspace."]);
    expect(await ask("USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION")).toEqual([400, "There is already an invite waiting for that email. Share its link under Waiting to join."]);
    expect(await ask("SOMETHING_NEW")).toEqual([400, "library wording"]);
  });
});

describe("providers", () => {
  it("previews models through the guarded provider client without storing the pasted key", async () => {
    const w = await workspace();
    const route = await import("../src/app/api/providers/models/route");
    const before = await db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM provider WHERE workspace_id = ?`, w.ws);
    hoisted.previewModels = true;
    const preview = () => call(route.POST, "POST", "/api/providers/models", { json: { kind: "ollama", key: "sim_preview_key" } });
    const r = await preview();
    expect(r.status, r.text).toBe(200);
    expect((r.data as unknown as { models: { id: string }[] }).models.map((m) => m.id)).toEqual(["llama3.1:8b", "qwen3:1.7b"]);
    expect(r.text).not.toContain("sim_preview_key");
    expect(hoisted.previewAuth).toBe("Bearer sim_preview_key");
    expect(await db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM provider WHERE workspace_id = ?`, w.ws)).toEqual(before);
    w.as("member");
    expect((await preview()).status).toBe(403);
    hoisted.previewModels = false;
  });

  it("lists a provider's models for an owner, and nobody else", async () => {
    const w = await workspace();
    await addProvider(w.ws, w.owner, "prv_models", "ollama", `${providerUrl}/v1`, null);
    const route = await import("../src/app/api/providers/[id]/models/route");
    const get = () => call(route.GET, "GET", "/api/providers/prv_models/models", { params: { id: "prv_models" } });
    const r = await get();
    expect(r.status).toBe(200);
    expect((r.data as unknown as { models: { id: string }[] }).models.map((m) => m.id)).toEqual(["llama3.1:8b", "qwen3:1.7b"]);
    w.as("member");
    expect((await get()).status).toBe(403);
    await workspace();
    expect((await get()).status).toBe(404);
  });

  it("explains a refused address instead of answering 500", async () => {
    await workspace();
    const route = await import("../src/app/api/providers/route");
    const r = await call(route.POST, "POST", "/api/providers", { json: { kind: "openai_compat", label: "Mine", baseUrl: "http://models.example.test/v1", model: "m", roles: ["plan"] } });
    expect(r.status).toBe(400);
    expect(r.text).toContain("https");
  });

  it("rejects provider task roles that do not have a working route", async () => {
    await workspace();
    const providers = await import("../src/app/api/providers/route");
    const add = await call(providers.POST, "POST", "/api/providers", { json: { kind: "openai_compat", label: "Old route", baseUrl: "https://models.example.test/v1", model: "m", roles: ["asr"] } });
    expect(add.status).toBe(400);
    expect(await db.one(`SELECT COUNT(*)::int AS count FROM provider WHERE label = 'Old route'`)).toEqual({ count: 0 });
    const routes = await import("../src/app/api/providers/routes/route");
    const save = await call(routes.PUT, "PUT", "/api/providers/routes", { json: { routes: [{ role: "clips", providerId: "prv_old", model: "m" }] } });
    expect(save.status).toBe(400);
  });

  it("does not send a stored key to a new address", async () => {
    const w = await workspace();
    await addProvider(w.ws, w.owner, "prv_move", "openai_compat", "https://first.example.test/v1", "sim_key_to_keep_private");
    const route = await import("../src/app/api/providers/[id]/route");
    const r = await call(route.PATCH, "PATCH", "/api/providers/prv_move", { params: { id: "prv_move" }, json: { baseUrl: "https://second.example.test/v1" } });
    expect(r.status).toBe(200);
    expect(await db.one(`SELECT key_sealed, key_hint FROM provider WHERE id = 'prv_move'`)).toEqual({ key_sealed: null, key_hint: null });
  });

  it("fails a speech endpoint that refuses the key", async () => {
    const { testProvider } = await import("../src/server/providers");
    const w = await workspace();
    await addProvider(w.ws, w.owner, "prv_asr", "asr_endpoint", `${providerUrl}/asr`, null);
    const row = (await db.one(`SELECT * FROM provider WHERE id = 'prv_asr'`))!;
    await db.run(`UPDATE provider SET roles = '["asr"]' WHERE id = 'prv_asr'`);
    const result = await testProvider({ ...(row as never as Parameters<typeof testProvider>[0]), roles: '["asr"]' });
    expect(result.ok).toBe(false);
  });
});

describe("translation drafts", () => {
  it("flags a line the model handed back untranslated", async () => {
    const { translateLines } = await import("../src/server/providers");
    const w = await workspace();
    await addProvider(w.ws, w.owner, "prv_tr", "ollama", `${providerUrl}/v1`, null);
    const row = (await db.one(`SELECT * FROM provider WHERE id = 'prv_tr'`))!;
    const out = await translateLines(row as never, [{ i: 0, t: "Welcome back to the show" }, { i: 1, t: "Thanks for having me, friend." }, { i: 2, t: "Sharp sharp" }], { code: "zu", name: "isiZulu" }, []);
    expect([...out.flags.entries()]).toEqual([[1, "Same as the original: it may not have been translated."]]);
  });
});

describe("voice notes on local storage", () => {
  it("go from the upload route through the worker and come back as text", async () => {
    const w = await workspace();
    const route = await import("../src/app/api/projects/[id]/assistant/transcribe/route");
    const { claim, succeed } = await import("../src/server/jobs");
    const { handle } = await import("../src/server/pipeline");
    const form = new FormData();
    form.append("audio", new Blob(["audio bytes"], { type: "audio/wav" }), "voice.wav");
    const answered = call(route.POST, "POST", `/api/projects/${w.prj}/assistant/transcribe`, { params: { id: w.prj }, body: form });
    let job;
    for (let i = 0; i < 200 && !job; i++) { job = await claim("worker-voice", 60_000); if (!job) await new Promise((r) => setTimeout(r, 20)); }
    expect(job?.type).toBe("voice_transcribe");
    try {
      const output = await handle({ job: job!, input: JSON.parse(job!.input), beat: () => {}, signal: new AbortController().signal });
      await succeed(job!.id, "worker-voice", output);
    } catch (e) {
      await db.run(`UPDATE job SET status = 'failed', error = ? WHERE id = ?`, (e as Error).message, job!.id);
    }
    expect(await answered).toMatchObject({ status: 200, data: { text: "make a clip" } });
  });
});
