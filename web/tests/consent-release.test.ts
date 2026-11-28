// A held render goes back to work only when its gate passes, and never gets stuck on the way.
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { JobRow } from "../src/server/jobs";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";

vi.mock("../src/server/render", async (load) => {
  const actual = await load<typeof import("../src/server/render")>();
  return { ...actual, renderClip: vi.fn(async ({ out }: { out: string }) => writeFileSync(out, Buffer.from("test rendered media"))) };
});

let db: Db;
let actions: typeof import("../src/server/actions");
let pub: typeof import("../src/server/public");
let pipeline: typeof import("../src/server/pipeline");
let render: typeof import("../src/server/render");
let storage: typeof import("../src/server/storage");
type Ctx = Awaited<ReturnType<typeof seedWorkspace>>;

beforeAll(async () => {
  db = await openTestDb();
  actions = await import("../src/server/actions");
  pub = await import("../src/server/public");
  pipeline = await import("../src/server/pipeline");
  render = await import("../src/server/render");
  storage = await import("../src/server/storage");
}, 60_000);
afterAll(async () => await closeTestDb(db));

let n = 0;
async function project() {
  const k = ++n, ws = `org_rel${k}`, prj = `prj_rel${k}`;
  const ctx = await seedWorkspace(db, ws, `usr_rel${k}`, prj);
  const key = storage.storageKey(ws, prj, "source.mp4");
  storage.ensureDirFor(storage.absPath(key));
  writeFileSync(storage.absPath(key), "source bytes");
  await db.run(`INSERT INTO asset (id,workspace_id,project_id,kind,storage_key,filename,mime,bytes,duration_ms,meta,created_at) VALUES (?,?,?,'source',?,'source.mp4','video/mp4',12,20000,?,0)`, `src_rel${k}`, ws, prj, key, JSON.stringify({ durationMs: 20000, hasAudio: true, hasVideo: false, format: "mp4" }));
  const clip = async (startMs: number, endMs: number) => (await actions.createClip(ctx, prj, { title: "Clip", startMs, endMs })).id;
  return { ctx, ws, prj, k, clip };
}
async function person(ctx: Ctx, prj: string, name: string, ranges: { startMs: number; endMs: number }[] = []) {
  const { id } = await actions.addPerson(ctx, prj, { name, role: "guest", wholeRecording: !ranges.length, ranges });
  const link = await actions.requestConsent(ctx, prj, id, "appearance");
  return { id, name, token: link.url.split("/").pop()! };
}
const answer = (p: { token: string; name: string }, decision: "grant" | "revoke" | "decline", ip: string) => pub.consentAction(p.token, { decision, name: p.name }, ip, "test");
const make = async (ctx: Ctx, prj: string, clipId: string, language: string | null = null) => (await actions.createOutput(ctx, prj, { clipId, preset: "small", language, burn: false }, null)).id;
const state = async (outputId: string) => (await db.one<{ out: string; job: string; note: string | null }>(`SELECT o.status AS out, j.status AS job, o.note FROM output o JOIN job j ON j.id = o.job_id WHERE o.id = ?`, outputId))!;
/** What the worker does on success, without running ffmpeg. */
const finish = async (outputId: string) => {
  await db.run(`UPDATE job SET status = 'succeeded' WHERE id = (SELECT job_id FROM output WHERE id = ?)`, outputId);
  await db.run(`UPDATE output SET status = 'ready' WHERE id = ?`, outputId);
};

describe("releasing held renders", () => {
  it("a render made before the declaration stays held while a yes is missing, then runs", async () => {
    const { ctx, prj, clip } = await project();
    const guest = await person(ctx, prj, "Demo Guest");
    const out = await make(ctx, prj, await clip(0, 4000));
    expect(await state(out)).toMatchObject({ out: "blocked", job: "blocked" });
    expect((await state(out)).note).toBe("Record your creator declaration first.");
    await actions.declare(ctx, prj);
    expect(await state(out)).toMatchObject({ out: "blocked", job: "blocked", note: "Waiting on Demo Guest (requested)." });
    await answer(guest, "decline", "a");
    expect(await state(out)).toMatchObject({ out: "blocked", job: "blocked", note: "Waiting on Demo Guest (declined)." });
    await answer(guest, "grant", "a");
    expect(await state(out)).toMatchObject({ out: "queued", job: "queued" });
  });

  it("removing one of two people who have not said yes keeps the render held", async () => {
    const { ctx, prj, clip } = await project();
    await actions.declare(ctx, prj);
    const first = await person(ctx, prj, "First Guest");
    const second = await person(ctx, prj, "Second Guest");
    const out = await make(ctx, prj, await clip(0, 4000));
    await actions.removePerson(ctx, first.id);
    expect(await state(out)).toMatchObject({ out: "blocked", job: "blocked" });
    await answer(second, "grant", "b");
    expect(await state(out)).toMatchObject({ out: "queued", job: "queued" });
  });

  it("a member cannot clear a refusal by removing the person; an owner or admin can", async () => {
    const { ctx, prj, clip } = await project();
    await actions.declare(ctx, prj);
    const guest = await person(ctx, prj, "Declining Guest");
    await answer(guest, "decline", "g");
    const out = await make(ctx, prj, await clip(0, 4000));
    await expect(actions.removePerson({ ...ctx, role: "member" }, guest.id)).rejects.toMatchObject({ status: 403 });
    expect(await state(out)).toMatchObject({ out: "blocked", job: "blocked" });
    await actions.removePerson({ ...ctx, role: "admin" }, guest.id);
    expect(await state(out)).toMatchObject({ out: "queued", job: "queued" });
  });

  it("a member cannot ask a guest again, close their link, or get a plan to ask for them", async () => {
    const { ctx, prj } = await project();
    const guest = await person(ctx, prj, "Linked Guest");
    await answer(guest, "decline", "h");
    const member = { ...ctx, role: "member" };
    await expect(actions.requestConsent(member, prj, guest.id, "appearance")).rejects.toMatchObject({ status: 403 });
    const link = (await db.one<{ id: string }>(`SELECT id FROM share_link WHERE project_id = ? AND purpose = 'consent'`, prj))!;
    await expect(actions.revokeLink(member, link.id)).rejects.toMatchObject({ status: 403 });

    // A saved plan is another way in: approving it runs the same action under the approver's role.
    const seen = (await db.one<{ id: string; updated_at: number; seq: number }>(`SELECT c.id, c.updated_at, (SELECT MAX(seq) FROM consent_ledger WHERE consent_id = c.id) seq FROM consent c WHERE c.person_id = ?`, guest.id))!;
    const planner = await import("../src/server/planner");
    const planId = await planner.savePlan(member, prj, "ask again", "test", [{ kind: "action", action: "requestConsent", args: { personId: guest.id, scope: "voice" }, pre: { clips: [], lines: [], consent: { personId: guest.id, id: seen.id, updatedAt: seen.updated_at, ledgerSeq: seen.seq } }, preview: [] }]);
    await expect(planner.approvePlan(member, planId)).rejects.toMatchObject({ status: 403 });
    expect(await db.one<{ n: number }>(`SELECT COUNT(*) n FROM consent WHERE person_id = ?`, guest.id)).toEqual({ n: 1 });
    const { assistantTools } = await import("../src/server/assistant");
    expect(Object.keys(await assistantTools(member, prj, [], false))).not.toContain("requestConsent");
    expect(Object.keys(await assistantTools(ctx, prj, [], false))).toContain("requestConsent");

    // Review links are not consent, so a member still makes and closes them.
    const review = await actions.createReviewLink(member, prj, null, "Review", 7);
    await actions.revokeLink(member, review.id);
    await actions.revokeLink(ctx, link.id);
  });

  it("approving translated captions does not release a render that still waits on consent", async () => {
    const { ctx, ws, prj, k, clip } = await project();
    await actions.declare(ctx, prj);
    const guest = await person(ctx, prj, "Caption Guest");
    await db.run(`INSERT INTO caption_track (id,workspace_id,project_id,language,kind,status,engine,created_at,updated_at) VALUES (?,?,?,'zu','translation','draft','test',0,0)`, `trk_rel${k}`, ws, prj);
    await db.run(`INSERT INTO caption_line (id,track_id,idx,start_ms,end_ms,text,status) VALUES (?,?,0,0,1000,'Sawubona','draft')`, `ln_rel${k}`, `trk_rel${k}`);
    const out = await make(ctx, prj, await clip(0, 4000), "zu");
    await actions.approveAll(ctx, `trk_rel${k}`, "Naledi");
    expect(await state(out)).toMatchObject({ out: "blocked", job: "blocked" });
    await answer(guest, "grant", "c");
    expect(await state(out)).toMatchObject({ out: "queued", job: "queued" });
  });

  it("a new yes after a withdrawal renders the clip again", async () => {
    const { ctx, prj, clip } = await project();
    await actions.declare(ctx, prj);
    const guest = await person(ctx, prj, "Returning Guest");
    await answer(guest, "grant", "d");
    const out = await make(ctx, prj, await clip(0, 4000));
    await finish(out);
    await answer(guest, "revoke", "d");
    expect(await state(out)).toMatchObject({ out: "blocked" });
    await answer(guest, "grant", "d");
    expect(await state(out)).toMatchObject({ out: "queued", job: "queued", note: null });
  });

  it("a withdrawal holds only the clips that person appears in", async () => {
    const { ctx, prj, clip } = await project();
    await actions.declare(ctx, prj);
    const guest = await person(ctx, prj, "Late Guest", [{ startMs: 10_000, endMs: 15_000 }]);
    await answer(guest, "grant", "e");
    const without = await make(ctx, prj, await clip(0, 4000));
    const with_ = await make(ctx, prj, await clip(11_000, 14_000));
    await finish(without);
    await finish(with_);
    await answer(guest, "revoke", "e");
    expect(await state(without)).toMatchObject({ out: "ready" });
    expect(await state(with_)).toMatchObject({ out: "blocked" });
  });

  it("a withdrawal during a render leaves it held with the reason, and a new yes releases it", async () => {
    const { ctx, prj, clip } = await project();
    await actions.declare(ctx, prj);
    const guest = await person(ctx, prj, "Mid Render");
    await answer(guest, "grant", "f");
    const out = await make(ctx, prj, await clip(0, 4000));
    const job = (await db.one<JobRow>(`SELECT * FROM job WHERE id = (SELECT job_id FROM output WHERE id = ?)`, out))!;
    await db.run(`UPDATE job SET status='running', worker_id='w', attempts=1, lease_until=? WHERE id=?`, Date.now() + 60_000, job.id);
    vi.mocked(render.renderClip).mockImplementationOnce(async ({ out: file }: { out: string }) => {
      writeFileSync(file, "test rendered media");
      await answer(guest, "revoke", "f");
    });
    const running: JobRow = { ...job, status: "running", attempts: 1, worker_id: "w", lease_until: Date.now() + 60_000 };
    await expect(pipeline.handle({ job: running, input: JSON.parse(job.input), beat: () => {}, signal: new AbortController().signal })).rejects.toBeInstanceOf(pipeline.Blocked);
    const held = await state(out);
    expect(held.out).toBe("blocked");
    expect(held.note).toContain("withdrew consent");
    // What the worker does with a Blocked error.
    await db.run(`UPDATE job SET status='blocked', lease_until=NULL, worker_id=NULL WHERE id=?`, job.id);
    await answer(guest, "grant", "f");
    expect(await state(out)).toMatchObject({ out: "queued", job: "queued" });
  });
});
