// The rights gate holds an export until the creator has declared the work and everyone who appears in that
// stretch has said yes. A render must not leave the server while this is wrong.
import "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";

let db: Db;
let gateFor: typeof import("../src/server/rights").gateFor;
let gateReason: typeof import("../src/server/rights").gateReason;
let consentStatement: typeof import("../src/server/rights").consentStatement;
beforeAll(async () => {
  db = await openTestDb();
  ({ gateFor, gateReason, consentStatement } = await import("../src/server/rights"));
}, 60_000);
afterAll(async () => closeTestDb(db));

let n = 0;
async function project() {
  const k = ++n;
  const ctx = await seedWorkspace(db, `org_gate${k}`, `usr_gate${k}`, `prj_gate${k}`);
  return { ws: ctx.workspaceId, user: ctx.userId, project: `prj_gate${k}` };
}
async function declare(p: { ws: string; user: string; project: string }) {
  await db.run(`INSERT INTO declaration (id, workspace_id, project_id, user_id, statement, created_at) VALUES (?, ?, ?, ?, 'Synthetic test declaration.', 1)`, `dec_${p.project}`, p.ws, p.project, p.user);
}
async function person(p: { ws: string; project: string }, id: string, name: string, wholeRecording = 0) {
  await db.run(`INSERT INTO person (id, workspace_id, project_id, name, role, whole_recording, created_at) VALUES (?, ?, ?, ?, 'guest', ?, 1)`, id, p.ws, p.project, name, wholeRecording);
}
async function appearance(personId: string, startMs: number, endMs: number) {
  await db.run(`INSERT INTO appearance (id, person_id, start_ms, end_ms) VALUES (?, ?, ?, ?)`, `app_${personId}_${startMs}`, personId, startMs, endMs);
}
async function consent(p: { ws: string; project: string; user: string }, personId: string, status: string, requestedAt: number) {
  await db.run(
    `INSERT INTO consent (id, workspace_id, project_id, person_id, scope, status, statement, requested_by, requested_at, updated_at) VALUES (?, ?, ?, ?, 'appearance', ?, 'Synthetic consent statement.', ?, ?, ?)`,
    `con_${personId}_${requestedAt}`, p.ws, p.project, personId, status, p.user, requestedAt, requestedAt,
  );
}

describe("rights gate", () => {
  it("holds a clip until the creator has declared the work", async () => {
    const p = await project();
    const gate = await gateFor(p.project, 0, 30_000);
    expect(gate.ok).toBe(false);
    expect(gate.declaration).toBe(false);
    expect(gateReason(gate)).toBe("Record your creator declaration first.");
  });

  it("releases a clip once the declaration is recorded and nobody in it is waiting", async () => {
    const p = await project();
    await declare(p);
    expect((await gateFor(p.project, 0, 30_000)).ok).toBe(true);
  });

  it("holds a clip while a person in that stretch has not said yes", async () => {
    const p = await project();
    await declare(p);
    await person(p, "per_ask", "Thandi");
    await appearance("per_ask", 10_000, 40_000);
    await consent(p, "per_ask", "requested", 1);
    const gate = await gateFor(p.project, 0, 30_000);
    expect(gate.ok).toBe(false);
    expect(gate.waiting).toEqual([{ personId: "per_ask", name: "Thandi", status: "requested" }]);
    expect(gateReason(gate)).toBe("Waiting on Thandi (requested).");
  });

  it("does not hold a clip for someone who appears only outside it", async () => {
    const p = await project();
    await declare(p);
    await person(p, "per_later", "Sipho");
    await appearance("per_later", 120_000, 150_000);
    await consent(p, "per_later", "requested", 1);
    expect((await gateFor(p.project, 0, 30_000)).ok).toBe(true);
  });

  it("holds every clip for someone recorded across the whole recording", async () => {
    const p = await project();
    await declare(p);
    await person(p, "per_all", "Lerato", 1);
    await consent(p, "per_all", "requested", 1);
    expect((await gateFor(p.project, 500_000, 530_000)).ok).toBe(false);
  });

  it("uses the latest answer: a yes that is later revoked holds the clip again", async () => {
    const p = await project();
    await declare(p);
    await person(p, "per_flip", "Naledi");
    await appearance("per_flip", 0, 60_000);
    await consent(p, "per_flip", "granted", 1);
    expect((await gateFor(p.project, 0, 30_000)).ok).toBe(true);
    await consent(p, "per_flip", "revoked", 2);
    const gate = await gateFor(p.project, 0, 30_000);
    expect(gate.ok).toBe(false);
    expect(gate.waiting[0].status).toBe("revoked");
  });

  it("names a person who has never been asked as 'not asked'", async () => {
    const p = await project();
    await declare(p);
    await person(p, "per_new", "Ayanda");
    await appearance("per_new", 0, 60_000);
    expect((await gateFor(p.project, 0, 30_000)).waiting[0].status).toBe("not asked");
  });
});

describe("consent wording", () => {
  it("names the scope the person agreed to and the project, and says it can be withdrawn", () => {
    const s = consentStatement("Thandi", "Episode 04", "voice");
    expect(s).toContain("I, Thandi, agree that my voice in “Episode 04”");
    expect(s).toContain("I can withdraw this later");
    expect(consentStatement("Thandi", "Episode 04", "likeness")).toContain("my face and likeness");
    expect(consentStatement("Thandi", "Episode 04", "appearance")).toContain("my appearance, voice and words");
  });
});
