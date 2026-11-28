// Demo blocker (plan v3 §2): "three TikTok clips" on a fresh project must render the clips Cut makes,
// not read an empty clip list at approval time.
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JobRow } from "../src/server/jobs";

let db: Db;
let planner: typeof import("../src/server/planner");
let pipeline: typeof import("../src/server/pipeline");
let ctx: Awaited<ReturnType<typeof seedWorkspace>>;

beforeAll(async () => {
  db = await openTestDb();
  ctx = await seedWorkspace(db, "org_a", "usr_a", "prj_a");
  (await db.run(
    `INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES ('ast_src', 'org_a', 'prj_a', 'source', 'k/src.mp4', 'ep.mp4', 'video/mp4', 1, 0)`,
  ));
  planner = await import("../src/server/planner");
  pipeline = await import("../src/server/pipeline");
}, 60_000);
afterAll(async () => await closeTestDb(db));

const job = async (id: string) => (await db.one<JobRow>(`SELECT * FROM job WHERE id = ?`, id))!;
const noop = { beat: () => {}, signal: new AbortController().signal };

// What the worker would do: run the step, record success.
async function work(id: string) {
  const j = (await job(id));
  const out = await pipeline.handle({ job: j, input: JSON.parse(j.input), ...noop });
  (await db.run(`UPDATE job SET status = 'succeeded', output = ? WHERE id = ?`, JSON.stringify(out), id));
  return out as Record<string, unknown>;
}

describe("Hear → Cut → Publish on an empty project", () => {
  let jobs: string[] = [];

  it("marks Publish runnable when the same plan cuts clips", async () => {
    const steps = planner.describe(planner.ruleIntents("Transcribe it, then three TikTok clips and publish them"), (await planner.projectPlanState("org_a", "prj_a")));
    const publish = steps.find((s) => s.verb === "Publish")!;
    expect(publish.runnable).toBe(true);
    expect(publish.what).toMatch(/clips this plan suggests/);
    const id = (await planner.savePlan(ctx, "prj_a", "three TikTok clips", "IZWI rules", steps));
    const r = (await planner.approvePlan(ctx, id))!;
    expect(r.already).toBe(false);
    jobs = r.jobs;
    expect((await Promise.all(jobs.map(async (j) => (await job(j)).type)))).toEqual(["transcribe", "suggest_clips", "publish"]);
  });

  it("queues Publish after Cut, not after Hear", async () => {
    const [hear, cut, publish] = await Promise.all(jobs.map(job));
    expect(cut.depends_on).toBe(hear.id);
    expect(publish.depends_on).toBe(cut.id);
    expect((await db.one<{ n: number }>(`SELECT COUNT(*) n FROM output`))!.n).toBe(0);
  });

  it("renders the clips Cut found once Cut has run", async () => {
    const [hear, cut, publish] = jobs;
    // Stand in for whisper: a transcript the clip finder can read.
    (await db.run(`INSERT INTO caption_track (id, workspace_id, project_id, language, kind, status, engine, created_at, updated_at) VALUES ('trk', 'org_a', 'prj_a', 'en', 'source', 'draft', 'test', 0, 0)`));
    for (let i = 0; i < 60; i++) {
      (await db.run(
        `INSERT INTO caption_line (id, track_id, idx, start_ms, end_ms, text) VALUES (?, 'trk', ?, ?, ?, ?)`,
        `ln${i}`, i, i * 4000, i * 4000 + 3800, `Sentence ${i}: the thing nobody tells you about starting a podcast in Joburg is how much it costs.`,
      ));
    }
    (await db.run(`UPDATE job SET status = 'succeeded' WHERE id = ?`, hear));
    const cutOut = await work(cut);
    expect((cutOut.clipIds as string[]).length).toBeGreaterThan(0);

    const pubOut = await work(publish);
    expect(pubOut.renders).toBe((cutOut.clipIds as string[]).length);
    const outputs = (await db.all<{ clip_id: string; job_id: string; status: string }>(`SELECT clip_id, job_id, status FROM output`));
    expect(outputs.map((o) => o.clip_id).sort()).toEqual([...(cutOut.clipIds as string[])].sort());
    for (const o of outputs) {
      expect(o.status).toBe("queued");
      expect((await job(o.job_id)).type).toBe("render");
    }
    const kept = (await db.one<{ n: number }>(`SELECT COUNT(*) n FROM clip WHERE status = 'kept'`))!.n;
    expect(kept).toBe(outputs.length);
  });

  it("does not render the same clip twice when Publish runs again", async () => {
    const before = (await db.one<{ n: number }>(`SELECT COUNT(*) n FROM output`))!.n;
    const id = (await planner.savePlan(ctx, "prj_a", "publish", "IZWI rules", planner.describe([{ verb: "Publish" }], (await planner.projectPlanState("org_a", "prj_a")))));
    const [publish] = (await planner.approvePlan(ctx, id))!.jobs;
    await expect(work(publish)).rejects.toThrow(/no kept clips to render/);
    expect((await db.one<{ n: number }>(`SELECT COUNT(*) n FROM output`))!.n).toBe(before);
  });
});

describe("approvePlan", () => {
  it("rolls back every job when one step cannot be queued", async () => {
    await seedWorkspace(db, "org_a", "usr_a", "prj_empty");
    const steps = planner.describe([{ verb: "Hear" }, { verb: "Cut", count: 3 }], { hasSource: true, hasTranscript: false, sourceLanguage: null, kept: 0, translator: null });
    const id = (await planner.savePlan(ctx, "prj_empty", "clips", "IZWI rules", steps));
    const before = (await db.one<{ n: number }>(`SELECT COUNT(*) n FROM job`))!.n;
    await expect(planner.approvePlan(ctx, id)).rejects.toThrow(/Upload a recording first/);
    expect((await db.one<{ n: number }>(`SELECT COUNT(*) n FROM job`))!.n).toBe(before);
    expect((await db.one<{ status: string }>(`SELECT status FROM plan_run WHERE id = ?`, id))!.status).toBe("proposed");
  });

  it("answers 'already' the second time and queues nothing more", async () => {
    const id = (await planner.savePlan(ctx, "prj_a", "package", "IZWI rules", planner.describe([{ verb: "Record" }], (await planner.projectPlanState("org_a", "prj_a")))));
    expect((await planner.approvePlan(ctx, id))!.jobs).toHaveLength(1);
    expect((await planner.approvePlan(ctx, id))).toEqual({ already: true, jobs: [] });
  });

  it("does not find another workspace's plan", async () => {
    const other = { ...ctx, workspaceId: "org_b" };
    const id = (await planner.savePlan(ctx, "prj_a", "package", "IZWI rules", planner.describe([{ verb: "Record" }], (await planner.projectPlanState("org_a", "prj_a")))));
    expect((await planner.approvePlan(other, id))).toBeNull();
  });
});
