import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { acquireLease, BudgetError, priceFor, releaseLease, renewLease, reserveAttempt, settleAttempt } from "../src/server/budget";
import { acquireWhisperLease, claim, deferWhisperJob, enqueue, releaseWhisperLease } from "../src/server/jobs";

let database: Db;
beforeAll(async () => { database = await openTestDb(); });
afterAll(() => closeTestDb(database));

function workspace(id: string) {
  seedWorkspace(database, id, `user_${id}`, `project_${id}`);
  return id;
}

describe("assistant budget reservations and leases", () => {
  it("reserves within the daily token limit and settles actual or unknown usage", () => {
    const ws = workspace("budget-settle");
    vi.stubEnv("IZWI_ASSISTANT_DAILY_TOKENS", "50");
    const r = reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "demo:free", serializedRequestBytes: 30, maxOutputTokens: 6 });
    expect(r.reservedTokens).toBe(36);
    settleAttempt(r, { input: 4, output: 3 });
    const row = database.one<{ tokens_reserved: number; tokens_used: number }>("SELECT tokens_reserved, tokens_used FROM assistant_budget WHERE workspace_id = ?", ws);
    expect(row).toEqual({ tokens_reserved: 0, tokens_used: 7 });
    const unknown = reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "demo:free", serializedRequestBytes: 3, maxOutputTokens: 2 });
    settleAttempt(unknown, null);
    expect(database.one<{ tokens_used: number }>("SELECT tokens_used FROM assistant_budget WHERE workspace_id = ?", ws)?.tokens_used).toBe(12);
    vi.unstubAllEnvs();
  });

  it("does not overshoot under concurrent reservations and refuses unknown prices", async () => {
    const ws = workspace("budget-race");
    vi.stubEnv("IZWI_ASSISTANT_DAILY_TOKENS", "8");
    const attempts = await Promise.allSettled([1, 2].map(() => Promise.resolve().then(() => reserveAttempt({
      workspaceId: ws, userId: "u", providerId: "p", model: "demo:free", serializedRequestBytes: 0, maxOutputTokens: 5,
    }))));
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(database.one<{ tokens_reserved: number }>("SELECT tokens_reserved FROM assistant_budget WHERE workspace_id = ?", ws)?.tokens_reserved).toBe(5);
    expect(priceFor("unknown-model")).toBeNull();
    expect(() => reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "unknown-model", serializedRequestBytes: 1, maxOutputTokens: 1 })).toThrow(BudgetError);
    const oversize = workspace("budget-initial-cap");
    expect(() => reserveAttempt({ workspaceId: oversize, userId: "u", providerId: "p", model: "demo:free", serializedRequestBytes: 0, maxOutputTokens: 9 })).toThrow(BudgetError);
    expect(database.one("SELECT 1 FROM assistant_budget WHERE workspace_id = ?", oversize)).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("enforces a zero default cost cap for priced models", () => {
    const ws = workspace("budget-cost");
    expect(() => reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "unpriced", serializedRequestBytes: 1, maxOutputTokens: 1 })).toThrow(/no approved price/);
  });

  it("prices validated loopback Ollama providers at zero while retaining token reservations", () => {
    const ws = workspace("budget-ollama");
    const provider = { kind: "ollama" as const, base_url: "http://127.0.0.1:11434/v1" };
    expect(priceFor("local-paid-name", provider)).toEqual({ in: 0, out: 0 });
    const r = reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "local-paid-name", provider, serializedRequestBytes: 47, maxOutputTokens: 9 });
    expect(r.reservedTokens).toBe(56);
    expect(r.reservedCents).toBe(0);
  });

  it("allows one stream per user and reclaims an expired lease", () => {
    const ws = workspace("budget-lease");
    const user = "user_budget-lease";
    expect(acquireLease(user, ws)).toBe(true);
    expect(acquireLease(user, ws)).toBe(false);
    expect(renewLease(user, ws)).toBe(true);
    database.run("UPDATE assistant_lease SET expires_at = 0 WHERE user_id = ?", user);
    expect(acquireLease(user, ws)).toBe(true);
    expect(releaseLease(user, ws)).toBe(true);
  });

  it("claims the highest priority ready job first", () => {
    const ws = workspace("budget-priority");
    enqueue({ workspaceId: ws, projectId: `project_${ws}`, type: "probe", priority: 1 });
    const urgent = enqueue({ workspaceId: ws, projectId: `project_${ws}`, type: "probe", priority: 9 });
    expect(claim("worker", 60_000)?.id).toBe(urgent.id);
  });

  it("holds one DB-backed whisper lease across jobs and defers a blocked job without a failed attempt", () => {
    const ws = workspace("whisper-lease");
    const first = enqueue({ workspaceId: ws, projectId: `project_${ws}`, type: "transcribe", priority: 1000 });
    const second = enqueue({ workspaceId: ws, projectId: `project_${ws}`, type: "voice_transcribe" });
    expect(acquireWhisperLease(first.id)).toBe(true);
    expect(acquireWhisperLease(second.id)).toBe(false);
    const claimed = claim("worker", 60_000)!;
    expect(claimed.id).toBe(first.id);
    expect(deferWhisperJob(claimed.id, "worker")).toBe(true);
    expect(database.one<{ status: string; attempts: number }>("SELECT status, attempts FROM job WHERE id = ?", first.id)).toEqual({ status: "queued", attempts: 0 });
    database.run("UPDATE whisper_lease SET expires_at = 0 WHERE id = 1");
    expect(acquireWhisperLease(second.id)).toBe(true);
    expect(releaseWhisperLease(second.id)).toBe(true);
  });
});
