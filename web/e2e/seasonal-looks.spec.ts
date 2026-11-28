import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ownerState = process.env.IZWI_E2E_OWNER_STATE;
const screenshotDir = path.resolve(process.cwd(), "../design/mockups");
test("creator opts into seasonal suggestions and applies a look only after accepting", async ({ browser, baseURL }) => {
  test.skip(!ownerState || !existsSync(ownerState), "Set IZWI_E2E_OWNER_STATE to a local owner session file.");
  const context = await browser.newContext({ storageState: ownerState!, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/app/settings?tab=seasonal`);
    const toggle = page.getByLabel(/Show seasonal suggestions on Home/);
    if (!(await toggle.isChecked())) await toggle.check();
    await expect(page.getByRole("status")).toHaveText("Seasonal suggestions are on.");
    await page.goto(`${baseURL}/app`);
    const suggestion = page.getByLabel("Seasonal suggestion");
    await expect(suggestion.getByText(/will not change your look until you accept/)).toBeVisible();
    const shell = page.locator(".z-shell");
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "seasonal-looks-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(screenshotDir, "seasonal-looks-mobile.png"), fullPage: true });
    await suggestion.getByRole("button", { name: "Accept seasonal look" }).click();
    const current = await page.evaluate(async () => (await fetch("/api/seasonal-suggestions")).json());
    await expect(shell).toHaveAttribute("data-izwi-theme", current.suggestion.theme);
    await expect(shell).toHaveAttribute("data-izwi-accent", current.suggestion.accent);
    await expect(page.getByRole("status")).toHaveText("Seasonal look applied after your approval.");
  } finally { await context.close(); }
});
