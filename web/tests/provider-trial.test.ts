import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

const base = "https://models.example.test/v1";
const endpoint = `${base}/chat/completions`;
const provider = { base_url: base, model: "trial", workspace_id: "workspace-a" };
let db: Db;
let trial: typeof import("../src/server/provider-trial");

beforeAll(async () => {
  db = await openTestDb();
  await seedWorkspace(db, provider.workspace_id, "owner-a", "project-a");
  await seedWorkspace(db, "workspace-b", "owner-b", "project-b");
  trial = await import("../src/server/provider-trial");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  (await db.run("DELETE FROM usage_event"));
});
afterAll(async () => await closeTestDb(db));

function configure(capMicros: number, maxMicrosPerRequest: number, maxRequests: number) {
  vi.stubEnv("IZWI_PROVIDER_TRIAL", "1");
  vi.stubEnv("IZWI_PROVIDER_TRIAL_RULES", JSON.stringify([{ baseUrl: base, model: provider.model, capMicros, maxMicrosPerRequest, maxRequests }]));
}

it("leaves ordinary local use unmetered when the trial is off", async () => {
  vi.stubEnv("IZWI_PROVIDER_TRIAL", "0");
  expect((await trial.reserveTrialCall(provider, endpoint))).toBeNull();
});

it("requires a configured exact provider, model and endpoint", () => {
  vi.stubEnv("IZWI_PROVIDER_TRIAL", "1");
  vi.stubEnv("IZWI_PROVIDER_TRIAL_RULES", "");
  expect(() => trial.reserveTrialCall(provider, endpoint)).toThrow(/no valid provider policy/);
  configure(100, 40, 3);
  expect(() => trial.reserveTrialCall({ ...provider, model: "other" }, endpoint)).toThrow(/outside/);
  expect(() => trial.reserveTrialCall(provider, base)).toThrow(/outside/);
});

it("reserves before dispatch and enforces the same spending cap across workspaces", async () => {
  configure(100, 40, 5);
  const receipt = (await trial.reserveTrialCall(provider, endpoint));
  (await trial.recordTrialTokens(receipt, 40, 10));
  (await trial.reserveTrialCall({ ...provider, workspace_id: "workspace-b" }, endpoint));
  expect(() => trial.reserveTrialCall(provider, endpoint)).toThrow(/cap has been reached/);
  expect((await db.all("SELECT unit, amount FROM usage_event ORDER BY unit, amount"))).toEqual([
    { unit: "trial_input_tokens", amount: 40 },
    { unit: "trial_output_tokens", amount: 10 },
    { unit: "trial_reserved_usd_micros", amount: 40 },
    { unit: "trial_reserved_usd_micros", amount: 40 },
  ]);
});

it("enforces request limits on a free route", async () => {
  configure(0, 0, 1);
  expect((await trial.reserveTrialCall(provider, endpoint))).toBeTruthy();
  expect(() => trial.reserveTrialCall(provider, endpoint)).toThrow(/cap has been reached/);
});
