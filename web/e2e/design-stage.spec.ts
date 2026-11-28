import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ownerState = process.env.IZWI_E2E_OWNER_STATE;
const projectId = process.env.IZWI_E2E_DESIGN_PROJECT;
const screenshotDir = path.resolve(process.cwd(), "../design/mockups");
test("creator drafts, approves and downloads a text-led design mock-up", async ({ browser, baseURL }) => {
  test.skip(!ownerState || !existsSync(ownerState) || !projectId, "Set owner state and a local project fixture.");
  const context = await browser.newContext({ storageState: ownerState!, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/app/p/${projectId}/design`);
    await expect(page.getByRole("heading", { name: "Design a cover or poster" })).toBeVisible();
    await page.getByLabel("Output type").selectOption("poster");
    await page.getByLabel("Platform").selectOption("general");
    await page.getByLabel("Headline").fill("A community gathering");
    await page.getByLabel(/Subtitle or date/).fill("12 December");
    await page.getByRole("button", { name: "Save design draft" }).click();
    await expect(page.getByRole("status")).toHaveText("Editable design mock-up saved as a draft.");
    await page.getByRole("button", { name: "Approve mock-up" }).click();
    await expect(page.getByRole("button", { name: "Download SVG" })).toBeVisible();
    mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, "design-stage-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(screenshotDir, "design-stage-mobile.png"), fullPage: true });
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download SVG" }).click();
    expect((await download).suggestedFilename()).toBe("izwi-poster.svg");
  } finally { await context.close(); }
});
