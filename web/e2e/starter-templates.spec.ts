import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ownerState = process.env.IZWI_E2E_OWNER_STATE;
const screenshotDir = path.resolve(process.cwd(), "../design/mockups");

test("starter template creates an editable outline and title without overwriting project work", async ({ browser, baseURL }) => {
  test.skip(!ownerState || !existsSync(ownerState), "Set IZWI_E2E_OWNER_STATE to a local owner session file.");
  const context = await browser.newContext({ storageState: ownerState!, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/app`);
    await page.getByRole("button", { name: /Start a new story/ }).click();
    const library = page.getByLabel("Starter templates").last();
    await library.getByRole("button", { name: /Podcast/ }).click();
    const outline = library.getByLabel(/Editable outline draft/);
    await expect(outline).toContainText("Hook:");
    await outline.fill("My own version\nHook: revised by me");
    await library.getByRole("button", { name: "Use this outline" }).click();
    await expect(page.getByLabel(/Title/)).toHaveValue("[Guest] on [topic]");
    await expect(library.getByRole("status")).toContainText("ready to edit");
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "starter-templates-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(screenshotDir, "starter-templates-mobile.png"), fullPage: true });
  } finally { await context.close(); }
});
