// Captures real IZWI AI screens for the ad. Public routes only: no sign-in, no test accounts on production.
// Usage: node production/scripts/capture-app.mjs [baseUrl] [outDir]
// Needs `playwright` resolvable (e.g. NODE_PATH pointing at a folder where `npm i playwright` ran).
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] ?? "https://izwi-ai-six.vercel.app";
const out = process.argv[3] ?? "production/assets/captures";
mkdirSync(out, { recursive: true });

const routes = [
  ["home", "/"],
  ["sign-in", "/sign-in"],
  ["trust", "/trust"],
];
const viewports = [["16x9", { width: 1920, height: 1080 }], ["9x16", { width: 540, height: 960 }]];

const browser = await chromium.launch();
const log = [];
for (const [vpName, vp] of viewports) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: vpName === "9x16" ? 2 : 1 });
  const page = await ctx.newPage();
  for (const [name, path] of routes) {
    const url = base + path;
    try {
      const res = await page.goto(url, { waitUntil: "load", timeout: 45000 });
      await page.waitForTimeout(2500);
      const file = `izwi_capture_${name}_${vpName}.png`;
      await page.screenshot({ path: join(out, file) });
      log.push({ file, url, finalUrl: page.url(), status: res?.status() ?? null, viewport: vp, capturedAt: new Date().toISOString() });
    } catch (e) {
      log.push({ url, viewport: vp, error: String(e.message ?? e).slice(0, 200) });
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(out, "captures.json"), JSON.stringify({ base, note: "Real screenshots of the deployed app. Production ran the pre-PR#16 main at capture time.", captures: log }, null, 2));
console.log(JSON.stringify(log.map((l) => [l.file ?? "ERR", l.finalUrl ?? l.error, l.status])));
