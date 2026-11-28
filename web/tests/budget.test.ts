import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { acquireLease, BudgetError, priceFor, releaseLease, renewLease, reserveAttempt, settleAttempt } from "../src/server/budget";
import { acquireWhisperLease, claim, deferWhisperJob, enqueue, releaseWhisperLease } from "../src/server/jobs";

let database: Db;
beforeAll(async () => { database = await openTestDb(); }, 60_000);
afterAll(async () => closeTestDb(database));

async function workspace(id: string) {
  await seedWorkspace(database, id, `user_${id}`, `project_${id}`);
  return id;
}

describe("assistant budget reservations and leases", () => {
  it("reserves within the daily token limit and settles actual or unknown usage", async () => {
    const ws = await workspace("budget-settle");
    vi.stubEnv("IZWI_ASSISTANT_DAILY_TOKENS", "50");
    const r = await reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "demo:free", serializedRequestBytes: 30, maxOutputTokens: 6 });
    expect(r.reservedTokens).toBe(36);
    await settleAttempt(r, { input: 4, output: 3 });
    expect(await database.one(`SELECT tokens_reserved, tokens_used FROM assistant_budget WHERE workspace_id = ?`, ws)).toEqual({ tokens_reserved: 0, tokens_used: 7 });
    const unknown = await reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "demo:free", serializedRequestBytes: 3, maxOutputTokens: 2 });
    await settleAttempt(unknown, null);
    expect(await database.one(`SELECT tokens_used FROM assistant_budget WHERE workspace_id = ?`, ws)).toEqual({ tokens_used: 12 });
    vi.unstubAllEnvs();
  });
  it("does not overshoot caps under concurrent reservations and refuses unknown prices", async () => {
    const ws = await workspace("budget-race");
    vi.stubEnv("IZWI_ASSISTANT_DAILY_TOKENS", "8");
    const attempts = await Promise.allSettled([1, 2].map(() => reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "demo:free", serializedRequestBytes: 0, maxOutputTokens: 5 })));
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await database.one<{ tokens_reserved: number }>("SELECT tokens_reserved FROM assistant_budget WHERE workspace_id = ?", ws))?.tokens_reserved).toBe(5);
    expect(priceFor("unknown-model")).toBeNull();
    await expect(reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "unknown-model", serializedRequestBytes: 1, maxOutputTokens: 1 })).rejects.toBeInstanceOf(BudgetError);
    const oversize = await workspace("budget-initial-cap");
    await expect(reserveAttempt({ workspaceId: oversize, userId: "u", providerId: "p", model: "demo:free", serializedRequestBytes: 0, maxOutputTokens: 9 })).rejects.toBeInstanceOf(BudgetError);
    expect(await database.one("SELECT 1 FROM assistant_budget WHERE workspace_id = ?", oversize)).toBeUndefined();
    vi.unstubAllEnvs();
  });
  it("prices validated loopback Ollama and owner-marked free tiers at zero", async () => {
    const ws = await workspace("budget-ollama");
    const provider = { kind: "ollama" as const, base_url: "http://127.0.0.1:11434/v1" };
    expect(priceFor("local-paid-name", provider)).toEqual({ in: 0, out: 0 });
    const r = await reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "local-paid-name", provider, serializedRequestBytes: 47, maxOutputTokens: 9 });
    expect(r.reservedTokens).toBe(56);
    expect(r.reservedCents).toBe(0);
    const free = { kind: "groq" as const, base_url: "https://api.groq.com/openai/v1", free_tier: 1 };
    expect(priceFor("any-provider-model", free)).toEqual({ in: 0, out: 0 });
    const freeReceipt = await reserveAttempt({ workspaceId: ws, userId: "u", providerId: "p", model: "any-provider-model", provider: free, serializedRequestBytes: 13, maxOutputTokens: 7 });
    expect(freeReceipt.reservedTokens).toBe(20);
  });
  it("requires configured exchange rates for priced models", () => {
    expect(priceFor("openai/gpt-oss-20b")).toBeNull();
    vi.stubEnv("IZWI_USD_ZAR", "18.5");
    vi.stubEnv("IZWI_USD_ZAR_ASOF", "2026-11-26");
    expect(priceFor("openai/gpt-oss-20b")).toEqual({ in: 139, out: 555 });
    vi.unstubAllEnvs();
  });
  it("budgets Meta's paid model from its published price, within the Rand cap", async () => {
    const ws = await workspace("budget-meta");
    const provider = { kind: "meta" as const, base_url: "https://api.meta.ai/v1" };
    const args = { workspaceId: ws, userId: "u", providerId: "p", model: "muse-spark-1.1", provider, serializedRequestBytes: 40_000, maxOutputTokens: 800 };
    vi.stubEnv("IZWI_USD_ZAR", "17.3787");
    expect(priceFor("muse-spark-1.1", provider)).toEqual({ in: 2173, out: 7386 });
    // The default cap is zero cents, so a paid model stays off until the operator sets one.
    await expect(reserveAttempt(args)).rejects.toBeInstanceOf(BudgetError);
    vi.stubEnv("IZWI_ASSISTANT_DAILY_CENTS", "100");
    expect((await reserveAttempt(args)).reservedCents).toBe(93);
    await expect(reserveAttempt(args)).rejects.toBeInstanceOf(BudgetError);
    vi.unstubAllEnvs();
  });
  it("allows one assistant stream per user and reclaims an expired lease", async () => {
    const ws = await workspace("budget-lease");
    const user = "user_budget-lease";
    expect(await acquireLease(user, ws)).toBe(true);
    expect(await acquireLease(user, ws)).toBe(false);
    expect(await renewLease(user, ws)).toBe(true);
    await database.run("UPDATE assistant_lease SET expires_at = 0 WHERE user_id = ?", user);
    expect(await acquireLease(user, ws)).toBe(true);
    expect(await releaseLease(user, ws)).toBe(true);
  });
  it("claims highest priority first and defers blocked transcription without charging an attempt", async () => {
    const ws = await workspace("budget-priority");
    await enqueue({ workspaceId: ws, projectId: `project_${ws}`, type: "probe", priority: 1 });
    const urgent = await enqueue({ workspaceId: ws, projectId: `project_${ws}`, type: "probe", priority: 9 });
    expect((await claim("worker", 60_000))?.id).toBe(urgent.id);
    const ws2 = await workspace("whisper-lease");
    const first = await enqueue({ workspaceId: ws2, projectId: `project_${ws2}`, type: "transcribe", priority: 1000 });
    const second = await enqueue({ workspaceId: ws2, projectId: `project_${ws2}`, type: "voice_transcribe" });
    expect(await acquireWhisperLease(first.id)).toBe(true);
    expect(await acquireWhisperLease(second.id)).toBe(false);
    const claimed = await claim("worker", 60_000);
    expect(claimed?.id).toBe(first.id);
    expect(await deferWhisperJob(first.id, "worker")).toBe(true);
    expect(await database.one(`SELECT status, attempts FROM job WHERE id = ?`, first.id)).toEqual({ status: "queued", attempts: 0 });
    await database.run("UPDATE whisper_lease SET expires_at = 0 WHERE id = 1");
    expect(await acquireWhisperLease(second.id)).toBe(true);
    expect(await releaseWhisperLease(second.id)).toBe(true);
  });
});
