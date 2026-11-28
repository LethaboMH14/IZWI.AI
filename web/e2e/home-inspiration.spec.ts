import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ownerState = process.env.IZWI_E2E_OWNER_STATE;
const screenshotDir = path.resolve(process.cwd(), "../design/mockups");
test("owner selects a niche and sees practical tips without fabricated YouTube inspiration", async ({ browser, baseURL }) => {
  test.skip(!ownerState || !existsSync(ownerState), "Set IZWI_E2E_OWNER_STATE to a local owner session file.");
  const context = await browser.newContext({ storageState: ownerState!, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.route("**/api/home-inspiration", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ json: { niche: "cooking", tips: ["Check recipe quantities before recording."] } });
      else await route.continue();
    });
    await page.goto(`${baseURL}/app`);
    await page.getByRole("heading", { name: /Tips for your/ }).waitFor();
    await page.getByLabel("Creator type").selectOption("cooking");
    await page.getByRole("button", { name: "Save creator type" }).click();
    await expect(page.getByRole("status")).toHaveText("Your Home tips now use this creator type.");
    await expect(page.getByText(/No videos are shown/)).toBeVisible();
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "home-inspiration-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(screenshotDir, "home-inspiration-mobile.png"), fullPage: true });
  } finally { await context.close(); }
});
