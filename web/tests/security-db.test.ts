// Plan v3 §1.5, §1.7, §1.8, §1.10 and §2: rate limits, consent ledger, tenant isolation, lease ownership.
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JobRow } from "../src/server/jobs";

let db: Db;
let jobs: typeof import("../src/server/jobs");
let ledger: typeof import("../src/server/ledger");
let rl: typeof import("../src/server/ratelimit");
let pipeline: typeof import("../src/server/pipeline");
let pub: typeof import("../src/server/public");
let crypto: typeof import("../src/server/crypto");

beforeAll(async () => {
  db = await openTestDb();
  await seedWorkspace(db, "org_a", "usr_a", "prj_a");
  await seedWorkspace(db, "org_b", "usr_b", "prj_b");
  jobs = await import("../src/server/jobs");
  ledger = await import("../src/server/ledger");
  rl = await import("../src/server/ratelimit");
  pipeline = await import("../src/server/pipeline");
  pub = await import("../src/server/public");
  crypto = await import("../src/server/crypto");
}, 60_000);
afterAll(async () => closeTestDb(db));

describe("rate limits", () => {
  it("lets max requests through in a window, then answers 429 with Retry-After", async () => {
    for (let i = 0; i < 3; i++) await rl.rateLimit("t:a", 3, 60_000);
    await expect(rl.rateLimit("t:a", 3, 60_000)).rejects.toBeInstanceOf(rl.RateLimitError);
    await expect(rl.rateLimit("t:b", 3, 60_000)).resolves.toBeUndefined();
  });
  it("persists the count in Postgres and validates proxy addresses", async () => {
    expect((await db.one<{ count: number }>(`SELECT count FROM rate_limit WHERE key = 't:a'`))?.count).toBe(4);
    const req = new Request("http://x/", { headers: { "x-forwarded-for": "41.1.2.3, 10.0.0.1" } });
    expect(rl.clientIp(req)).toBe("direct");
    process.env.IZWI_TRUST_PROXY = "1";
    expect(rl.clientIp(req)).toBe("41.1.2.3");
    expect(rl.clientIp(new Request("http://x/", { headers: { "x-forwarded-for": "<script>" } }))).toBe("unknown");
    delete process.env.IZWI_TRUST_PROXY;
  });
});

describe("consent ledger", () => {
  const rec = (i: number) => ({ consentId: `cns_${i}`, workspaceId: "org_a", projectId: "prj_a", personId: "per_1", scope: "voice", decision: "granted" as const, respondedName: "Thandi", at: 1_700_000_000_000 + i });
  it("serializes, chains, signs and protects each append", async () => {
    const a = await ledger.appendConsent(rec(1));
    const b = await ledger.appendConsent(rec(2));
    expect((await db.one<{ prev_hash: string }>(`SELECT prev_hash FROM consent_ledger WHERE seq = ?`, b.seq))?.prev_hash).toBe(a.hash);
    const trusted = new Set([ledger.ledgerKeys().pubHex]);
    expect(await ledger.verifyLedger(trusted)).toEqual({ ok: true, entries: 2, head: b.hash });
    expect((await ledger.ledgerHead()).hash).toBe(b.hash);
    await expect(db.run(`UPDATE consent_ledger SET record = '{}' WHERE seq = 1`)).rejects.toThrow(/append-only/);
    await expect(db.run(`DELETE FROM consent_ledger WHERE seq = 1`)).rejects.toThrow(/append-only/);
    const rows = await db.all<Parameters<typeof ledger.verifyLedger>[1] extends (infer R)[] | undefined ? R : never>(`SELECT * FROM consent_ledger ORDER BY seq`);
    const forged = rows.map((r, i) => (i === 0 ? { ...r, record: r.record.replace('"granted"', '"declined"') } : r));
    expect(await ledger.verifyLedger(trusted, forged)).toMatchObject({ ok: false, seq: 1, reason: /hash/ });
    expect(await ledger.verifyLedger(new Set(["00".repeat(32)]))).toMatchObject({ ok: false, reason: /does not trust/ });
  });
});

describe("tenant isolation and job leases", () => {
  it("scopes idempotency keys to a workspace", async () => {
    const a = await jobs.enqueue({ workspaceId: "org_a", projectId: "prj_a", type: "package", idempotencyKey: "same" });
    const b = await jobs.enqueue({ workspaceId: "org_b", projectId: "prj_b", type: "package", idempotencyKey: "same" });
    expect(b.id).not.toBe(a.id);
    expect(b.workspace_id).toBe("org_b");
    expect((await jobs.enqueue({ workspaceId: "org_a", projectId: "prj_a", type: "package", idempotencyKey: "same" })).id).toBe(a.id);
  });
  it("does not let a job read another workspace asset or a link preview", async () => {
    await db.run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES ('ast_b', 'org_b', 'prj_b', 'source', 'org_b/prj_b/s.mp4', 's.mp4', 'video/mp4', 1, 0)`);
    const j = await jobs.enqueue({ workspaceId: "org_a", projectId: "prj_a", type: "probe", input: { assetId: "ast_b" } });
    await expect(pipeline.handle({ job: j, input: { assetId: "ast_b" }, beat: async () => {}, signal: new AbortController().signal })).rejects.toThrow(/missing/);
    await db.run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES ('ast_pa', 'org_a', 'prj_a', 'proxy', 'org_a/prj_a/p.mp4', 'p.mp4', 'video/mp4', 1, 0)`);
    await db.run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES ('ast_pb', 'org_b', 'prj_b', 'proxy', 'org_b/prj_b/p.mp4', 'p.mp4', 'video/mp4', 1, 0)`);
    const token = crypto.newToken();
    await db.run(`INSERT INTO share_link (id, workspace_id, project_id, purpose, token_hash, expires_at, created_by, created_at) VALUES ('lnk_a', 'org_a', 'prj_a', 'review', ?, ?, 'usr_a', 0)`, crypto.hashToken(token), Date.now() + 60_000);
    expect((await pub.assetAllowedForToken("ast_pa", token, null))?.id).toBe("ast_pa");
    expect(await pub.assetAllowedForToken("ast_pb", token, null)).toBeNull();
    expect(await pub.assetAllowedForToken("ast_b", token, null)).toBeNull();
  });
  it("only the lease holder can finish or cancel a job", async () => {
    const j = await jobs.enqueue({ workspaceId: "org_a", projectId: "prj_a", type: "package" });
    await db.run(`UPDATE job SET status = 'running', worker_id = ?, lease_until = ? WHERE id = ?`, "w1", Date.now() + 60_000, j.id);
    expect(await jobs.succeed(j.id, "w2", {})).toBe(false);
    expect(await jobs.failJob(j.id, "w2", "x", false)).toBe(false);
    expect(await jobs.block(j.id, "w2", "x")).toBe(false);
    expect((await db.one<JobRow>(`SELECT * FROM job WHERE id = ?`, j.id))?.status).toBe("running");
    expect(await jobs.succeed(j.id, "w1", { done: true })).toBe(true);
    expect(await jobs.cancel(j.id, "org_a")).toBe(false);
  });
});
