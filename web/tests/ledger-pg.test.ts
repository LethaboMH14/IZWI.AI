import { afterAll, beforeAll, expect, it } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";

let db: Db;
let ledger: typeof import("../src/server/ledger");
beforeAll(async () => {
  db = await openTestDb();
  await seedWorkspace(db, "ledger_ws", "ledger_user", "ledger_project");
  ledger = await import("../src/server/ledger");
}, 60_000);
afterAll(async () => closeTestDb(db));

it("appends a signed Postgres chain and rejects a duplicate chain predecessor", async () => {
  const first = await ledger.appendConsent({ consentId: "consent_1", workspaceId: "ledger_ws", projectId: "ledger_project", personId: "person_1", scope: "voice", decision: "granted", respondedName: "Naledi", at: 1 });
  const second = await ledger.appendConsent({ consentId: "consent_2", workspaceId: "ledger_ws", projectId: "ledger_project", personId: "person_2", scope: "appearance", decision: "declined", respondedName: "Thandi", at: 2 });
  expect((await db.one<{ prev_hash: string }>(`SELECT prev_hash FROM consent_ledger WHERE seq = ?`, second.seq))?.prev_hash).toBe(first.hash);
  expect(await ledger.verifyLedger(new Set([ledger.ledgerKeys().pubHex]))).toMatchObject({ ok: true, entries: 2, head: second.hash });
  await expect(db.run(`INSERT INTO consent_ledger (workspace_id, consent_id, record, prev_hash, hash, sig, ts) VALUES (?, ?, ?, ?, ?, ?, ?)`, "ledger_ws", "consent_3", "{}", first.hash, "a".repeat(64), "sig", 3)).rejects.toThrow(/unique/i);
});
