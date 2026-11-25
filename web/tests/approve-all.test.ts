// "Approve all clean lines" against a real, throwaway SQLite file.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lineFlag } from "../src/server/captions";

const dir = mkdtempSync(path.join(tmpdir(), "izwi-approve-"));
process.env.IZWI_STORAGE_DIR = dir;
process.env.IZWI_DB_FILE = path.join(dir, "test.db");

type Mods = { db: typeof import("../src/server/db"); actions: typeof import("../src/server/actions") };
let m: Mods;
const ctx = { userId: "usr_t", userName: "Naledi", email: "t@example.test", workspaceId: "org_t", role: "owner" };

beforeAll(async () => {
  const db = await import("../src/server/db");
  // better-auth owns these tables in the app; the migrations only need their ids.
  db.db.exec(`CREATE TABLE organization (id TEXT PRIMARY KEY); CREATE TABLE "user" (id TEXT PRIMARY KEY);`);
  (await import("../src/server/migrations")).migrateApp(() => {});
  db.run(`INSERT INTO organization (id) VALUES ('org_t')`);
  db.run(`INSERT INTO "user" (id) VALUES ('usr_t')`);
  db.run(`INSERT INTO project (id, workspace_id, title, kind, created_by, created_at, updated_at) VALUES ('prj_t', 'org_t', 'Test', 'podcast', 'usr_t', 0, 0)`);
  m = { db, actions: await import("../src/server/actions") };
}, 60_000);
afterAll(() => {
  m?.db.db.close();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows may still hold the WAL file; the OS temp dir is cleaned later. */ }
});

function track(id: string, lines: { text: string; flag: string | null }[]) {
  m.db.run(`INSERT INTO caption_track (id, workspace_id, project_id, language, kind, status, engine, created_at, updated_at) VALUES (?, 'org_t', 'prj_t', ?, 'source', 'draft', 'test', 0, 0)`, id, id);
  lines.forEach((l, i) =>
    m.db.run(`INSERT INTO caption_line (id, track_id, idx, start_ms, end_ms, text, flag) VALUES (?, ?, ?, ?, ?, ?, ?)`, `${id}_${i}`, id, i, i * 2000, i * 2000 + 1500, l.text, l.flag),
  );
}
const statusOf = (id: string) => m.db.one<{ status: string }>(`SELECT status FROM caption_line WHERE id = ?`, id)!.status;

describe("approveAll", () => {
  it("skips a line the new spelling check flags and approves the clean ones", () => {
    const texts = ["We added captions in isiZulu.", "You switch between English\nand ISI Zulu all the time.", "Thanks for listening."];
    // Same call the transcribe step makes when it writes each line.
    track("new", texts.map((text) => ({ text, flag: lineFlag(text, [{ p: 0.99 }]) })));
    expect(m.db.one<{ flag: string }>(`SELECT flag FROM caption_line WHERE id = 'new_1'`)!.flag).toMatch(/South African/);

    const r = m.actions.approveAll(ctx, "new", "Naledi");
    expect(r.left).toBe(1);
    expect([statusOf("new_0"), statusOf("new_1"), statusOf("new_2")]).toEqual(["approved", "draft", "approved"]);
    expect(m.db.one<{ status: string }>(`SELECT status FROM caption_track WHERE id = 'new'`)!.status).not.toBe("approved");
  });

  it("clears the flag once the creator fixes the line, so it can then be approved", () => {
    m.actions.updateLine(ctx, "new_1", { text: "You switch between English and isiZulu all the time." }, "Naledi");
    const r = m.actions.approveAll(ctx, "new", "Naledi");
    expect(r.left).toBe(0);
    expect(m.db.one<{ status: string }>(`SELECT status FROM caption_track WHERE id = 'new'`)!.status).toBe("approved");
  });

  it("does not re-check transcripts written before the fix: their stored flag stays empty", () => {
    // Known limit: flags are computed when the transcript is written. Creators re-run Transcribe or fix these by hand.
    track("old", [{ text: "You switch between English\nand ISI Zulu all the time.", flag: null }]);
    expect(m.actions.approveAll(ctx, "old", "Naledi").left).toBe(0);
    expect(statusOf("old_0")).toBe("approved");
  });
});
