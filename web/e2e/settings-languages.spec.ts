import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ownerState = process.env.IZWI_E2E_OWNER_STATE;
const screenshotDir = path.resolve(process.cwd(), "../design/mockups");

test("owner chooses greeting languages and sees the saved Home greeting", async ({ browser, baseURL }) => {
  test.skip(!ownerState || !existsSync(ownerState), "Set IZWI_E2E_OWNER_STATE to a local throwaway owner storage-state file.");
  const context = await browser.newContext({ storageState: ownerState!, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.route("**/api/settings/languages", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ json: { languages: ["xh", "en"] } });
      else await route.fulfill({ json: { languages: ["en"], options: [{ id: "xh", name: "isiXhosa", text: "Molo", review: "Needs native-speaker review" }] } });
    });
    const response = await page.goto(`${baseURL}/app/settings?tab=languages`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Languages you use" })).toBeVisible();
    await page.getByLabel(/isiXhosa/).check();
    await page.getByRole("button", { name: "Save languages" }).click();
    await expect(page.getByRole("status")).toHaveText("Greeting languages saved.");
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "settings-languages-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(screenshotDir, "settings-languages-mobile.png"), fullPage: true });
  } finally { await context.close(); }
});
