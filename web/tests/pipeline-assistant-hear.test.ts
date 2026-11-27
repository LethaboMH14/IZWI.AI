import "./helpers/testdb";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import type { JobRow } from "../src/server/jobs";

vi.mock("../src/server/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/media")>();
  return { ...actual, whisper: vi.fn(async () => ({ language: "en", engine: "sim_test_whisper", segments: [{ startMs: 0, endMs: 2500, text: "hello everyone welcome", words: [{ w: "hello", s: 0, e: 800 }, { w: "everyone", s: 800, e: 1600 }, { w: "welcome", s: 1600, e: 2500 }] }] })) };
});

let db: Db;
let pipeline: typeof import("../src/server/pipeline");
let ctx: ReturnType<typeof seedWorkspace>;
beforeAll(async () => {
  db = await openTestDb();
  ctx = await seedWorkspace(db, "org_assistant_hear", "user_assistant_hear", "project_assistant_hear");
  pipeline = await import("../src/server/pipeline");
  db.run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, duration_ms, created_at) VALUES ('source_asset','org_assistant_hear','project_assistant_hear','source','ws/proj/source.mp4','source.mp4','video/mp4',10,1500,1)`);
  db.run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, duration_ms, created_at) VALUES ('audio_asset','org_assistant_hear','project_assistant_hear','audio','ws/proj/audio.wav','audio.wav','audio/wav',10,1500,1)`);
  db.run(`INSERT INTO caption_track (id, workspace_id, project_id, language, kind, status, engine, created_at, updated_at) VALUES ('existing_track','org_assistant_hear','project_assistant_hear','en','source','draft','old',1,1)`);
});
afterAll(() => await closeTestDb(db));

it("a worker rejects an assistant Hear replacement inside the source-track transaction", async () => {
  const job = { id: "assistant_hear_job", workspace_id: ctx.workspaceId, project_id: "project_assistant_hear", type: "transcribe", created_by: ctx.userId } as JobRow;
  await expect(pipeline.handle({ job, input: { assetId: "source_asset", assistant: true }, beat: () => {}, signal: new AbortController().signal }))
    .rejects.toThrow("This assistant Hear is stale because a transcript already exists.");
  expect(db.all<{ id: string }>(`SELECT id FROM caption_track WHERE project_id = 'project_assistant_hear' AND kind = 'source'`)).toEqual([{ id: "existing_track" }]);
  expect(db.all(`SELECT id FROM caption_line WHERE track_id = 'existing_track'`)).toEqual([]);
});
