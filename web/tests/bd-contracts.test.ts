import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";

let db: Db;
let ctx: ReturnType<typeof seedWorkspace>;
let actions: typeof import("../src/server/actions");
let state: typeof import("../src/server/state");

beforeAll(async () => {
  db = await openTestDb();
  ctx = await seedWorkspace(db, "org_bd", "usr_bd", "prj_bd");
  actions = await import("../src/server/actions");
  state = await import("../src/server/state");
  db.run(`INSERT INTO clip (id,workspace_id,project_id,title,start_ms,end_ms,reason,origin,status,version,created_at,updated_at) VALUES ('clip_bd','org_bd','prj_bd','Clip',0,2000,'test','manual','kept',2,0,123)`);
  db.run(`INSERT INTO caption_track (id,workspace_id,project_id,language,kind,status,engine,created_at,updated_at) VALUES ('track_bd','org_bd','prj_bd','en','source','draft','test',0,0)`);
  db.run(`INSERT INTO caption_line (id,track_id,idx,start_ms,end_ms,text,words,status) VALUES ('line_bd','track_bd',0,0,1000,'Original line','[]','draft')`);
  db.run(`INSERT INTO declaration (id,workspace_id,project_id,user_id,statement,created_at) VALUES ('decl_bd','org_bd','prj_bd','usr_bd','Test declaration',1)`);
  db.run(`INSERT INTO asset (id,workspace_id,project_id,kind,storage_key,filename,mime,bytes,meta,created_at) VALUES ('asset_src_bd','org_bd','prj_bd','source','a','a.mp4','video/mp4',100,'{}',0),('asset_peaks_bd','org_bd','prj_bd','peaks','b','peaks.json','application/json',7,'{}',0),('asset_render_bd','org_bd','prj_bd','render','c','c.mp4','video/mp4',23,'{}',0)`);
}, 60_000);
afterAll(() => await closeTestDb(db));

describe("Lane B/D backend contracts", () => {
  it("returns clip version timestamps and workspace/project storage totals; lite omits peaks", () => {
    const full = state.projectState(ctx, "prj_bd");
    expect(full.clips[0]).toMatchObject({ version: 2, updatedAt: 123 });
    expect(full.storage).toEqual({ bytes: 130, byKind: { source: 100, peaks: 7, render: 23 } });
    const lite = state.projectState(ctx, "prj_bd", { lite: true });
    expect(lite).not.toHaveProperty("peaks");
  });

  it("rejects stale clip timestamps without changing the clip and accepts current timestamps", () => {
    expect(() => actions.updateClip(ctx, "clip_bd", { startMs: 100, endMs: 2100, expectUpdatedAt: 122 })).toThrow(expect.objectContaining({ status: 409 }));
    expect(db.one<{ start_ms: number; updated_at: number }>(`SELECT start_ms,updated_at FROM clip WHERE id='clip_bd'`)).toEqual({ start_ms: 0, updated_at: 123 });
    actions.updateClip(ctx, "clip_bd", { startMs: 100, endMs: 2100, expectUpdatedAt: 123 });
    expect(db.one<{ start_ms: number }>(`SELECT start_ms FROM clip WHERE id='clip_bd'`)?.start_ms).toBe(100);
  });

  it("rejects stale caption text and allows a matching expectation", () => {
    expect(() => actions.updateLine(ctx, "line_bd", { text: "Changed line", expectText: "Old line" }, ctx.userName)).toThrow(expect.objectContaining({ status: 409 }));
    expect(db.one<{ text: string }>(`SELECT text FROM caption_line WHERE id='line_bd'`)?.text).toBe("Original line");
    actions.updateLine(ctx, "line_bd", { text: "Changed line", expectText: "Original line" }, ctx.userName);
    expect(db.one<{ text: string }>(`SELECT text FROM caption_line WHERE id='line_bd'`)?.text).toBe("Changed line");
  });

  it("returns the same output for a repeated idempotency key and creates distinct outputs for different keys", () => {
    const input = { clipId: "clip_bd", preset: "small", language: null, burn: false };
    const first = actions.createOutput(ctx, "prj_bd", input, "same-key");
    const again = actions.createOutput(ctx, "prj_bd", input, "same-key");
    expect(again).toEqual(first);
    expect(db.one<{ n: number }>(`SELECT COUNT(*) n FROM output WHERE id IN (?,?)`, first.id, again.id)?.n).toBe(1);
    const other = actions.createOutput(ctx, "prj_bd", input, "other-key");
    expect(other.id).not.toBe(first.id);
    expect(db.one<{ n: number }>(`SELECT COUNT(*) n FROM output WHERE id IN (?,?)`, first.id, other.id)?.n).toBe(2);
    const jobInput = db.one<{ input: string }>(`SELECT input FROM job WHERE idempotency_key = ?`, `org_bd:api:same-key`);
    expect(JSON.parse(jobInput!.input)).toMatchObject({ outputId: first.id, clip: { startMs: 100, endMs: 2100, version: 3 } });
  });
});
