// Plan v3 §1.5, §1.7, §1.8, §1.10 and §2 jobs: rate limits, consent ledger, tenant isolation, lease ownership.
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
  seedWorkspace(db, "org_a", "usr_a", "prj_a");
  seedWorkspace(db, "org_b", "usr_b", "prj_b");
  jobs = await import("../src/server/jobs");
  ledger = await import("../src/server/ledger");
  rl = await import("../src/server/ratelimit");
  pipeline = await import("../src/server/pipeline");
  pub = await import("../src/server/public");
  crypto = await import("../src/server/crypto");
}, 60_000);
afterAll(() => closeTestDb(db));

describe("rate limits", () => {
  it("lets max requests through in a window, then answers 429 with Retry-After", () => {
    for (let i = 0; i < 3; i++) rl.rateLimit("t:a", 3, 60_000);
    let err: unknown;
    try {
      rl.rateLimit("t:a", 3, 60_000);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(rl.RateLimitError);
    expect((err as InstanceType<typeof rl.RateLimitError>).status).toBe(429);
    expect((err as InstanceType<typeof rl.RateLimitError>).retryAfterSec).toBeGreaterThan(0);
    expect(() => rl.rateLimit("t:b", 3, 60_000)).not.toThrow();
  });

  it("is kept in the database, so a new process sees the same count", () => {
    expect(db.one<{ count: number }>(`SELECT count FROM rate_limit WHERE key = 't:a'`)!.count).toBe(4);
  });

  it("trusts the forwarded address only behind a declared proxy", () => {
    const req = new Request("http://x/", { headers: { "x-forwarded-for": "41.1.2.3, 10.0.0.1" } });
    expect(rl.clientIp(req)).toBe("direct");
    process.env.IZWI_TRUST_PROXY = "1";
    expect(rl.clientIp(req)).toBe("41.1.2.3");
    expect(rl.clientIp(new Request("http://x/", { headers: { "x-forwarded-for": "<script>" } }))).toBe("unknown");
    delete process.env.IZWI_TRUST_PROXY;
  });
});

describe("consent ledger", () => {
  const rec = (i: number) => ({
    consentId: `cns_${i}`, workspaceId: "org_a", projectId: "prj_a", personId: "per_1", scope: "voice",
    decision: "granted" as const, respondedName: "Thandi", at: 1_700_000_000_000 + i,
  });
  const trusted = () => new Set([ledger.ledgerKeys().pubHex]);

  it("chains and signs every entry", () => {
    const a = ledger.appendConsent(rec(1));
    const b = ledger.appendConsent(rec(2));
    expect(db.one<{ prev_hash: string }>(`SELECT prev_hash FROM consent_ledger WHERE seq = ?`, b.seq)!.prev_hash).toBe(a.hash);
    expect(ledger.verifyLedger(trusted())).toEqual({ ok: true, entries: 2, head: b.hash });
    expect(ledger.ledgerHead().hash).toBe(b.hash);
  });

  it("refuses updates and deletes at the database", () => {
    expect(() => db.run(`UPDATE consent_ledger SET record = '{}' WHERE seq = 1`)).toThrow(/append-only/);
    expect(() => db.run(`DELETE FROM consent_ledger WHERE seq = 1`)).toThrow(/append-only/);
  });

  it("finds a tampered record even if someone gets past the triggers", () => {
    const rows = db.all<Parameters<typeof ledger.verifyLedger>[1] extends (infer R)[] | undefined ? R : never>(`SELECT * FROM consent_ledger ORDER BY seq`);
    const forged = rows.map((r, i) => (i === 0 ? { ...r, record: r.record.replace('"granted"', '"declined"') } : r));
    expect(ledger.verifyLedger(trusted(), forged)).toMatchObject({ ok: false, seq: 1, reason: /hash/ });
  });

  it("rejects a chain signed by an unknown key", () => {
    expect(ledger.verifyLedger(new Set(["00".repeat(32)]))).toMatchObject({ ok: false, reason: /does not trust/ });
  });
});

describe("tenant isolation", () => {
  it("scopes idempotency keys to the workspace", () => {
    const a = jobs.enqueue({ workspaceId: "org_a", projectId: "prj_a", type: "package", idempotencyKey: "same" });
    const b = jobs.enqueue({ workspaceId: "org_b", projectId: "prj_b", type: "package", idempotencyKey: "same" });
    expect(b.id).not.toBe(a.id);
    expect(b.workspace_id).toBe("org_b");
    expect(jobs.enqueue({ workspaceId: "org_a", projectId: "prj_a", type: "package", idempotencyKey: "same" }).id).toBe(a.id);
  });

  it("a job cannot read another workspace's asset", async () => {
    db.run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES ('ast_b', 'org_b', 'prj_b', 'source', 'org_b/prj_b/s.mp4', 's.mp4', 'video/mp4', 1, 0)`);
    const j = jobs.enqueue({ workspaceId: "org_a", projectId: "prj_a", type: "probe", input: { assetId: "ast_b" } });
    await expect(pipeline.handle({ job: j, input: { assetId: "ast_b" }, beat: () => {}, signal: new AbortController().signal })).rejects.toThrow(/missing/);
  });

  it("a review link opens only its own project's preview", () => {
    db.run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES ('ast_pa', 'org_a', 'prj_a', 'proxy', 'org_a/prj_a/p.mp4', 'p.mp4', 'video/mp4', 1, 0)`);
    db.run(`INSERT INTO asset (id, workspace_id, project_id, kind, storage_key, filename, mime, bytes, created_at) VALUES ('ast_pb', 'org_b', 'prj_b', 'proxy', 'org_b/prj_b/p.mp4', 'p.mp4', 'video/mp4', 1, 0)`);
    const token = crypto.newToken();
    db.run(
      `INSERT INTO share_link (id, workspace_id, project_id, purpose, token_hash, expires_at, created_by, created_at) VALUES ('lnk_a', 'org_a', 'prj_a', 'review', ?, ?, 'usr_a', 0)`,
      crypto.hashToken(token), Date.now() + 60_000,
    );
    expect(pub.assetAllowedForToken("ast_pa", token, null)?.id).toBe("ast_pa");
    expect(pub.assetAllowedForToken("ast_pb", token, null)).toBeNull();
    expect(pub.assetAllowedForToken("ast_b", token, null)).toBeNull();
  });
});

describe("job leases", () => {
  const fresh = () => jobs.enqueue({ workspaceId: "org_a", projectId: "prj_a", type: "package" });
  const row = (id: string) => db.one<JobRow>(`SELECT * FROM job WHERE id = ?`, id)!;
  const claimThis = (id: string, worker: string) => {
    db.run(`UPDATE job SET status = 'running', worker_id = ?, lease_until = ? WHERE id = ?`, worker, Date.now() + 60_000, id);
  };

  it("only the worker holding the lease can finish the job", () => {
    const j = fresh();
    claimThis(j.id, "w1");
    expect(jobs.succeed(j.id, "w2", {})).toBe(false);
    expect(jobs.failJob(j.id, "w2", "x", false)).toBe(false);
    expect(jobs.block(j.id, "w2", "x")).toBe(false);
    expect(row(j.id).status).toBe("running");
    expect(jobs.succeed(j.id, "w1", { done: true })).toBe(true);
    expect(row(j.id).status).toBe("succeeded");
  });

  it("a job cancelled while running stays cancelled", () => {
    const j = fresh();
    claimThis(j.id, "w1");
    expect(jobs.cancel(j.id, "org_a")).toBe(true);
    expect(jobs.succeed(j.id, "w1", {})).toBe(false);
    expect(row(j.id).status).toBe("cancelled");
  });

  it("cannot cancel another workspace's job", () => {
    const j = fresh();
    expect(jobs.cancel(j.id, "org_b")).toBe(false);
  });
});
