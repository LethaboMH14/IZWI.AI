import { existsSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { JobRow } from "../src/server/jobs";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";

vi.mock("../src/server/render", async (load) => {
  const actual = await load<typeof import("../src/server/render")>();
  return { ...actual, renderClip: vi.fn(async ({ out, startMs, endMs }: { out: string; startMs: number; endMs: number }) => {
    expect(startMs).toBe(100);
    expect(endMs).toBe(2100);
    writeFileSync(out, Buffer.from("test rendered media"));
  }) };
});

let db: Db;
let ctx: Awaited<ReturnType<typeof seedWorkspace>>;
let actions: typeof import("../src/server/actions");
let pipeline: typeof import("../src/server/pipeline");
let storage: typeof import("../src/server/storage");

beforeAll(async () => {
  db = await openTestDb();
  ctx = await seedWorkspace(db, "org_stale", "usr_stale", "prj_stale");
  actions = await import("../src/server/actions");
  pipeline = await import("../src/server/pipeline");
  storage = await import("../src/server/storage");
  (await db.run(`INSERT INTO clip (id,workspace_id,project_id,title,start_ms,end_ms,reason,origin,status,created_at,updated_at) VALUES ('clip_stale','org_stale','prj_stale','Clip',100,2100,'test','manual','kept',0,0)`));
  (await db.run(`INSERT INTO declaration (id,workspace_id,project_id,user_id,statement,created_at) VALUES ('decl_stale','org_stale','prj_stale','usr_stale','Creator statement',10)`));
  const srcKey = storage.storageKey("org_stale", "prj_stale", "source.mp4");
  storage.ensureDirFor(storage.absPath(srcKey));
  writeFileSync(storage.absPath(srcKey), "source bytes");
  (await db.run(`INSERT INTO asset (id,workspace_id,project_id,kind,storage_key,filename,mime,bytes,duration_ms,meta,created_at) VALUES ('src_stale','org_stale','prj_stale','source',?,'source.mp4','video/mp4',12,4000,?,0)`, srcKey, JSON.stringify({ durationMs: 4000, hasAudio: true, hasVideo: false, format: "mp4" })));
}, 60_000);
afterAll(async () => await closeTestDb(db));

describe("render clip snapshots", () => {
  it("discards a render when the clip changes mid-render and removes temporary files", async () => {
    const output = (await actions.createOutput(ctx, "prj_stale", { clipId: "clip_stale", preset: "small", language: null, burn: false }, null));
    const job = (await db.one<JobRow>(`SELECT * FROM job WHERE id = (SELECT job_id FROM output WHERE id = ?)`, output.id))!;
    const input = JSON.parse(job.input) as Record<string, unknown>;
    (await db.run(`UPDATE job SET status='running',worker_id='worker_stale',attempts=1,lease_until=? WHERE id=?`, Date.now() + 60_000, job.id));
    (await db.run(`UPDATE output SET status='queued' WHERE id=?`, output.id));
    const realRender = vi.mocked((await import("../src/server/render")).renderClip).getMockImplementation()!;
    vi.mocked((await import("../src/server/render")).renderClip).mockImplementationOnce(async (args) => {
      await realRender(args);
      (await db.run(`UPDATE clip SET start_ms=200,end_ms=2200,version=version+1,updated_at=updated_at+1 WHERE id='clip_stale'`));
    });
    const running: JobRow = { ...job, type: "render", status: "running", attempts: 1, worker_id: "worker_stale", lease_until: Date.now() + 60_000 };
    await expect(pipeline.handle({ job: running, input, beat: () => {}, signal: new AbortController().signal })).rejects.toThrow("The clip changed during rendering. Render it again.");
    expect((await db.one<{ status: string; note: string }>(`SELECT status,note FROM output WHERE id=?`, output.id))).toEqual({ status: "failed", note: "The clip changed during rendering. Render it again." });
    expect((await db.one<{ status: string }>(`SELECT status FROM job WHERE id=?`, job.id))?.status).toBe("running");
    for (const name of [
      `render-${output.id}-1-worker_stale.mp4.tmp`,
      `render-${output.id}-1-worker_stale.mp4.provenance.json.tmp`,
    ]) expect(existsSync(storage.absPath(storage.storageKey("org_stale", "prj_stale", name)))).toBe(false);
    expect((await db.one<{ n: number }>(`SELECT COUNT(*) n FROM asset WHERE project_id='prj_stale' AND kind='render'`))?.n).toBe(0);
  });

  it("fails queued outputs and cancels their jobs when the trim moves", async () => {
    const output = (await actions.createOutput(ctx, "prj_stale", { clipId: "clip_stale", preset: "small", language: null, burn: false }, null));
    const jobId = (await db.one<{ job_id: string }>(`SELECT job_id FROM output WHERE id=?`, output.id))!.job_id;
    (await actions.updateClip(ctx, "clip_stale", { startMs: 300, endMs: 2300 }));
    expect((await db.one<{ status: string; note: string }>(`SELECT status,note FROM output WHERE id=?`, output.id))).toEqual({ status: "failed", note: "The clip changed during rendering. Render it again." });
    expect((await db.one<{ status: string }>(`SELECT status FROM job WHERE id=?`, jobId))?.status).toBe("cancelled");
  });
});
