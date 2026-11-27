import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lineFlag } from "../src/server/captions";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";

let db: Db;
let actions: typeof import("../src/server/actions");
const ctx = { userId: "usr_t", userName: "Naledi", email: "t@example.test", workspaceId: "org_t", role: "owner" };

beforeAll(async () => {
  db = await openTestDb();
  await seedWorkspace(db, "org_t", "usr_t", "prj_t");
  actions = await import("../src/server/actions");
}, 60_000);
afterAll(async () => closeTestDb(db));

async function track(id: string, lines: { text: string; flag: string | null }[]) {
  await db.run(`INSERT INTO caption_track (id, workspace_id, project_id, language, kind, status, engine, created_at, updated_at) VALUES (?, 'org_t', 'prj_t', ?, 'source', 'draft', 'test', 0, 0)`, id, id);
  for (const [i, line] of lines.entries()) {
    await db.run(`INSERT INTO caption_line (id, track_id, idx, start_ms, end_ms, text, flag) VALUES (?, ?, ?, ?, ?, ?, ?)`, `${id}_${i}`, id, i, i * 2000, i * 2000 + 1500, line.text, line.flag);
  }
}
const statusOf = async (id: string) => (await db.one<{ status: string }>(`SELECT status FROM caption_line WHERE id = ?`, id))!.status;

describe("approveAll", () => {
  it("skips lines flagged by spelling review and approves clean lines", async () => {
    const texts = ["We added captions in isiZulu.", "You switch between English\nand ISI Zulu all the time.", "Thanks for listening."];
    await track("new", texts.map((text) => ({ text, flag: lineFlag(text, [{ p: 0.99 }]) })));
    expect((await db.one<{ flag: string }>(`SELECT flag FROM caption_line WHERE id = 'new_1'`))?.flag).toMatch(/South African/);
    const r = await actions.approveAll(ctx, "new", "Naledi");
    expect(r.left).toBe(1);
    expect(await Promise.all([statusOf("new_0"), statusOf("new_1"), statusOf("new_2")])).toEqual(["approved", "draft", "approved"]);
    expect((await db.one<{ status: string }>(`SELECT status FROM caption_track WHERE id = 'new'`))?.status).not.toBe("approved");
  });
  it("clears a flag after correction and then allows approval", async () => {
    await actions.updateLine(ctx, "new_1", { text: "You switch between English and isiZulu all the time." }, "Naledi");
    const r = await actions.approveAll(ctx, "new", "Naledi");
    expect(r.left).toBe(0);
    expect((await db.one<{ status: string }>(`SELECT status FROM caption_track WHERE id = 'new'`))?.status).toBe("approved");
  });
  it("keeps pre-check transcripts eligible as clean", async () => {
    await track("old", [{ text: "You switch between English\nand ISI Zulu all the time.", flag: null }]);
    expect((await actions.approveAll(ctx, "old", "Naledi")).left).toBe(0);
    expect(await statusOf("old_0")).toBe("approved");
  });
});
