import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ownerState = process.env.IZWI_E2E_OWNER_STATE;
const projectId = process.env.IZWI_E2E_POLICY_PROJECT;
const outputId = process.env.IZWI_E2E_POLICY_OUTPUT;
const screenshotDir = path.resolve(process.cwd(), "../design/mockups");

test("owner runs and sees a sourced policy pre-check for a finished render", async ({ browser, baseURL }) => {
  test.skip(!ownerState || !existsSync(ownerState) || !projectId || !outputId, "Set owner state and a ready render project/output fixture.");
  const context = await browser.newContext({ storageState: ownerState!, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    const response = await page.goto(`${baseURL}/app/p/${projectId}`);
    expect(response?.status()).toBe(200);
    await page.getByRole("button", { name: /Publish/ }).click();
    await page.getByRole("button", { name: "Run policy pre-check" }).waitFor();
    await page.route("**/api/policy-check", async (route) => {
      if (route.request().method() === "POST") await route.fulfill({ json: { results: [{ platform: "youtube", status: "review", scope: "limited pre-check", checkedAt: Date.now(), findings: [{ field: "metadata", explanation: "Manual review needed.", rule: "Review metadata", sourceUrl: "https://support.google.com/youtube/answer/9288567?hl=en", checkedAt: "2026-11-28" }] }] } });
      else await route.continue();
    });
    await page.getByRole("button", { name: "Run policy pre-check" }).click();
    await expect(page.getByRole("status")).toContainText("Review every finding");
    await expect(page.getByText(/youtube: Review/)).toBeVisible();
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "policy-precheck-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(screenshotDir, "policy-precheck-mobile.png"), fullPage: true });
  } finally { await context.close(); }
});
