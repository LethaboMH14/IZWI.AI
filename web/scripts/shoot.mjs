// Signed-in screenshots of the running app for design review.
// Usage: node scripts/shoot.mjs <email> <password> <outDir> <width>x<height> /path=name [/path=name ...]
// Signs in through the real auth endpoint, then drives headless Chrome over the DevTools protocol with that cookie.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [email, password, outDir, size, ...shots] = process.argv.slice(2);
const [W, H] = size.split("x").map(Number);
const BASE = process.env.IZWI_URL || "http://localhost:3187";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const res = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, password }) });
if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]).map((kv) => ({ name: kv.slice(0, kv.indexOf("=")), value: kv.slice(kv.indexOf("=") + 1) }));

const profile = mkdtempSync(path.join(tmpdir(), "izwi-shot-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${profile}`, "--hide-scrollbars", "--mute-audio", "about:blank"], { stdio: "ignore" });
let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const t = await (await fetch("http://127.0.0.1:9333/json/list")).json();
    wsUrl = t.find((x) => x.type === "page")?.webSocketDebuggerUrl;
  } catch {}
}
if (!wsUrl) throw new Error("Chrome did not start");
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
// IZWI_CONSOLE=1 prints the page's console errors and uncaught exceptions (hydration mismatches show up here).
const showConsole = process.env.IZWI_CONSOLE === "1";
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (!showConsole) return;
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type))
    console.log(`console.${m.params.type}:`, m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 1500));
  if (m.method === "Runtime.exceptionThrown") console.log("exception:", (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 1500));
});
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });

await send("Network.enable");
await send("Page.enable");
await send("Runtime.enable");
for (const c of cookies) await send("Network.setCookie", { ...c, url: BASE });
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
mkdirSync(outDir, { recursive: true });
for (const s of shots) {
  const [p, name] = s.split("=");
  const nav = await send("Page.navigate", { url: BASE + p });
  if (nav.error || nav.result?.errorText) console.log("navigate:", JSON.stringify(nav.error || nav.result));
  await new Promise((r) => setTimeout(r, Number(process.env.IZWI_WAIT || 7000)));
  const info = await send("Runtime.evaluate", { expression: "location.href + ' | ' + document.title + ' | ' + document.body.innerText.length", returnByValue: true });
  console.log("page:", info.result?.result?.value);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(shot.result.data, "base64"));
  console.log(`saved ${name}.png`);
}
ws.close();
chrome.kill();
await new Promise((r) => setTimeout(r, 1500));
// Chrome can hold its profile for a moment after exit on Windows; a leftover temp folder is harmless.
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); } catch { console.log(`note: could not remove ${profile}`); }
