import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ownerState = process.env.IZWI_E2E_OWNER_STATE;
const screenshotDir = path.resolve(process.cwd(), "../design/mockups");

test("owner previews, saves and screenshots personal appearance preferences", async ({ browser, baseURL }) => {
  test.skip(!ownerState || !existsSync(ownerState), "Set IZWI_E2E_OWNER_STATE to a local throwaway owner storage-state file.");
  const context = await browser.newContext({ storageState: ownerState!, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.route("**/api/settings/preferences", async (route) => {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: body });
    });
    const response = await page.goto(`${baseURL}/app/settings?tab=preferences`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();
    await page.getByLabel("Theme").selectOption("warm");
    await page.getByLabel("Accent colour").selectOption("forest");
    await page.getByLabel("Font pairing").selectOption("clean");
    await page.getByLabel("Text size").selectOption("large");
    await page.getByLabel("Reduce motion").check();
    await expect.poll(() => page.locator(".z-shell").getAttribute("data-izwi-theme")).toBe("warm");
    await expect.poll(() => page.locator(".z-shell").getAttribute("data-izwi-accent")).toBe("forest");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByRole("status")).toHaveText("Preferences saved to your account.");
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "settings-preferences-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(screenshotDir, "settings-preferences-mobile.png"), fullPage: true });
  } finally { await context.close(); }
});
