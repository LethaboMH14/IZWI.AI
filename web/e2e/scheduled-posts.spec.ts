import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ownerState = process.env.IZWI_E2E_OWNER_STATE;
const projectId = process.env.IZWI_E2E_POLICY_PROJECT;
const outputId = process.env.IZWI_E2E_POLICY_OUTPUT;
const screenshotDir = path.resolve(process.cwd(), "../design/mockups");

test("owner acknowledges a policy review and downloads an honest manual post export", async ({ browser, baseURL }) => {
  test.skip(!ownerState || !existsSync(ownerState) || !projectId || !outputId, "Set owner state and a finished render project/output fixture.");
  const context = await browser.newContext({ storageState: ownerState!, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.route("**/api/post-schedules", async (route) => route.fulfill({ json: route.request().method() === "POST" ? { id: "standin", status: "manual_export", message: "Manual export prepared. IZWI has not scheduled or posted this content." } : { enabled: true } }));
    await page.route("**/api/policy-check", async (route) => {
      if (route.request().method() === "POST") await route.fulfill({ json: { results: [{ platform: "youtube", status: "review", findings: [], checkedAt: Date.now(), scope: "limited pre-check" }] } });
      else await route.fulfill({ json: { enabled: true } });
    });
    await page.goto(`${baseURL}/app/p/${projectId}`);
    await page.getByRole("button", { name: /Publish/ }).click();
    await page.getByRole("button", { name: "Prepare a manual post" }).waitFor();
    await page.getByRole("button", { name: "Prepare a manual post" }).click();
    await page.getByLabel("Platform").selectOption("youtube");
    await page.getByLabel(/Title/).fill("Review this before posting");
    await page.getByLabel(/Description/).fill("Creator supplied description");
    await page.getByLabel(/I reviewed the policy findings/).check();
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "scheduled-posts-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(screenshotDir, "scheduled-posts-mobile.png"), fullPage: true });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export for manual posting" }).click();
    expect((await download).suggestedFilename()).toContain("izwi-manual-post-youtube.json");
    await expect(page.getByRole("status")).toContainText("has not scheduled or posted it");
  } finally { await context.close(); }
});
