import { test, expect, type Page, type Browser } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ownerState = process.env.IZWI_E2E_OWNER_STATE;
const memberState = process.env.IZWI_E2E_MEMBER_STATE;
const featureOffUrl = process.env.IZWI_E2E_FLAG_OFF_URL || "http://127.0.0.1:4301";
const screenshotDir = path.resolve(process.cwd(), "../design/mockups");
const fixtureProvider = {
  id: "prv_standin", kind: "groq", label: "Groq stand-in", baseUrl: "https://api.groq.com/openai/v1", model: "mock/model",
  keyHint: "standin", freeTier: false, roles: ["chat", "plan", "translate"], privacy: "may_log",
  lastTestAt: 1, lastTestOk: true, lastTestNote: "mock/model answered a chat test request.",
};

async function installStandIn(page: Page, canEdit: boolean, saved: { current: unknown }) {
  await page.route("**/api/providers", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      saved.current = body;
      await route.fulfill({ json: { ...fixtureProvider, id: "prv_added", label: "Groq", model: body.model, roles: body.roles, lastTestAt: Date.now(), lastTestOk: true, lastTestNote: `${String(body.model)} answered a chat test request.` } });
      return;
    }
    await route.fulfill({ json: canEdit ? [] : [fixtureProvider] });
  });
  await page.route("**/api/providers/routes", async (route) => {
    await route.fulfill({ json: { canEdit, canFreeTier: canEdit, routes: [], providers: canEdit ? [] : [{ id: fixtureProvider.id, label: fixtureProvider.label, model: fixtureProvider.model, roles: fixtureProvider.roles, ready: true }] } });
  });
  await page.route("**/api/providers/models", async (route) => {
    const input = route.request().postDataJSON() as { kind: string; key?: string };
    expect(input.kind).toBe("groq");
    expect(input.key).toBe("test-key-not-a-secret");
    await route.fulfill({ json: { models: [{ id: "openai/gpt-oss-20b", label: "GPT OSS 20B", costTag: "Moderate", estRandPerTurn: 0.0015, rateAsOf: "2026-11-26" }] } });
  });
}

async function signedInPage(browser: Browser, state: string) {
  const context = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  return { context, page };
}

test("Connections is not found when its server flag is off", async ({ browser }) => {
  test.skip(!ownerState || !existsSync(ownerState), "Set IZWI_E2E_OWNER_STATE to a local owner storage-state file.");
  const { context, page } = await signedInPage(browser, ownerState!);
  try {
    const response = await page.goto(`${featureOffUrl}/app/settings`);
    expect(response?.status()).toBe(404);
  } finally { await context.close(); }
});

test("owner connects a stand-in provider and screenshots desktop and mobile", async ({ browser, baseURL }) => {
  test.skip(!ownerState || !existsSync(ownerState), "Set IZWI_E2E_OWNER_STATE to a local owner storage-state file.");
  const { context, page } = await signedInPage(browser, ownerState!);
  const saved: { current: unknown } = { current: null };
  try {
    await installStandIn(page, true, saved);
    const response = await page.goto(`${baseURL}/app/settings`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Connect a provider" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Free, runs on this computer" })).toBeVisible();
    await page.getByRole("button", { name: "Connect Groq" }).click();
    await page.getByLabel("Provider key").fill("test-key-not-a-secret");
    await page.getByRole("button", { name: "Load models" }).click();
    await page.getByLabel(/Choose model/).selectOption("openai/gpt-oss-20b");
    await expect(page.getByText(/R0\.0015 per typical turn/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save and test" })).toBeEnabled();
    await page.getByRole("button", { name: "Save and test" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Connection saved and test passed." })).toBeVisible();
    expect(saved.current).toMatchObject({ kind: "groq", model: "openai/gpt-oss-20b", roles: ["plan", "translate", "chat"] });
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "settings-connections-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(screenshotDir, "settings-connections-mobile.png"), fullPage: true });
  } finally { await context.close(); }
});

test("member sees no provider add, test or remove controls", async ({ browser, baseURL }) => {
  test.skip(!memberState || !existsSync(memberState), "Set IZWI_E2E_MEMBER_STATE to a local member storage-state file.");
  const { context, page } = await signedInPage(browser, memberState!);
  try {
    await installStandIn(page, false, { current: null });
    const response = await page.goto(`${baseURL}/app/settings`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Only owners and admins can add, test or remove provider connections.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Connect Groq|Save and test|Test again|Remove/ })).toHaveCount(0);
  } finally { await context.close(); }
});
