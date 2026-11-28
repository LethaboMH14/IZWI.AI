// A long recording is listened to without carry-over between windows, so one sentence cannot repeat to the end.
import "./helpers/testdb";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import type { JobRow } from "../src/server/jobs";

const seen = vi.hoisted(() => [] as { long?: boolean }[]);
vi.mock("../src/server/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/media")>();
  return { ...actual, whisper: vi.fn(async (_wav: string, _out: string, o: { long?: boolean }) => { seen.push({ long: o.long }); return { language: "en", engine: "test", segments: [{ startMs: 0, endMs: 2000, text: "hello everyone", words: [{ w: "hello", s: 0, e: 900 }, { w: "everyone", s: 900, e: 2000 }] }] }; }) };
});

let db: Db;
let pipeline: typeof import("../src/server/pipeline");
beforeAll(async () => {
  db = await openTestDb();
  pipeline = await import("../src/server/pipeline");
});
afterAll(async () => await closeTestDb(db));

it("turns carry-over off only for recordings longer than five minutes", async () => {
  for (const [k, ms] of [["short", 5 * 60_000], ["long", 25 * 60_000]] as const) {
    const ctx = await seedWorkspace(db, `org_${k}`, `usr_${k}`, `prj_${k}`);
    for (const kind of ["source", "audio"]) {
      await db.run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, 'a.wav', 'audio/wav', 10, ?, 1)`, `${kind}_${k}`, ctx.workspaceId, `prj_${k}`, kind, `org_${k}/prj_${k}/${kind}.wav`, ms);
    }
    // The step queues "suggest clips" behind itself, so its own row has to exist.
    await db.run(`INSERT INTO job (id, workspace_id, project_id, type, status, run_after, created_at) VALUES (?, ?, ?, 'transcribe', 'running', 0, 0)`, `job_${k}`, ctx.workspaceId, `prj_${k}`);
    const job = { id: `job_${k}`, workspace_id: ctx.workspaceId, project_id: `prj_${k}`, type: "transcribe", created_by: ctx.userId } as JobRow;
    await pipeline.handle({ job, input: { assetId: `source_${k}` }, beat: () => {}, signal: new AbortController().signal });
  }
  expect(seen).toEqual([{ long: false }, { long: true }]);
});
