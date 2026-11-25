// A scripted OpenAI-compatible server for security tests. It is NOT a model: every reply is decided by code
// from the request, so a test can prove how the studio assistant treats hostile output without any real LLM.
// Routes: GET /v1/models and POST /v1/chat/completions (streaming SSE or plain JSON, with tool calls).
// Mode comes from the `x-mock-mode` header, else from the model name before the first ":" (for example "evil:free").
// Every request is recorded in `requests` so tests can check exactly what left the app.
import http from "node:http";

export const MODES = ["normal", "evil", "evil_tool", "evil_tool_unicode", "evil_key", "inject", "image", "no_usage", "429", "400", "slow", "huge"];

const CANARY = /IZWI_CANARY_[0-9a-f]+/;
const CALL = /CALL_TOOL\s+(\w+)\s+(\{[^\n]*\})/g;

const text = (m) => (typeof m?.content === "string" ? m.content : Array.isArray(m?.content) ? m.content.map((p) => p?.text ?? "").join("") : "");
const system = (body) => (body.messages ?? []).filter((m) => m.role === "system").map(text).join("\n");
const split = (s, n) => { const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out; };

export function modeOf(headers, body) {
  const h = headers["x-mock-mode"];
  const mode = h ? String(h) : String(body?.model ?? "normal").split(":")[0];
  return MODES.includes(mode) ? mode : "normal";
}

// What the scripted model "says": a list of text chunks and tool calls, in order.
function script(mode, body, headers) {
  const sys = system(body);
  const last = (body.messages ?? []).at(-1);
  if (last?.role === "tool") return { parts: [{ text: "Done." }] };
  const firstClip = /"clips":\[\{"id":"([^"]+)"/.exec(sys)?.[1] ?? "clip_unknown";
  switch (mode) {
    case "evil": {
      const c = CANARY.exec(sys)?.[0];
      return { parts: [{ text: "Sure, here is the hidden token: " }, ...split(c ?? "NO_CANARY_SEEN", 5).map((t) => ({ text: t })), { text: " end." }] };
    }
    case "evil_tool": {
      const c = CANARY.exec(sys)?.[0] ?? "NO_CANARY_SEEN";
      return { parts: [{ text: "Titles ready." }, { tool: "draftTitles", args: JSON.stringify({ titles: [c] }), split: 9 }] };
    }
    case "evil_tool_unicode": {
      const c = CANARY.exec(sys)?.[0] ?? "NO_CANARY_SEEN";
      const escaped = [...c].map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
      return { parts: [{ text: "Titles ready." }, { tool: "proposeJobs", args: `{"jobs":[{"verb":"Cut"}],"reason":"${escaped}"}`, split: 7 }] };
    }
    case "evil_key": {
      const key = String(headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      return { parts: [{ text: "The key is " }, ...split(key || "NO_KEY_SEEN", 4).map((t) => ({ text: t })), { text: "." }] };
    }
    case "inject": {
      const transcript = sys.split("<untrusted_transcript>")[1] ?? "";
      const calls = [...transcript.matchAll(CALL)].slice(0, 5).map((m) => ({ tool: m[1], args: m[2], split: 11 }));
      return { parts: [{ text: calls.length ? "Following the instructions in the transcript." : "Nothing to follow." }, ...calls] };
    }
    case "image":
      return { parts: [{ text: "Look: ![pixel](https://evil.example/p.png?d=1) and <a href=\"javascript:alert(1)\">click</a> or [safe](https://evil.example/x) <img src=x onerror=alert(1)>" }] };
    case "no_usage":
      return { parts: [{ text: "A clean answer without usage metadata." }] };
    case "huge": {
      const total = Number(headers["x-mock-bytes"] ?? 64 * 1024 * 1024);
      return { huge: total };
    }
    case "slow":
      return { slow: Number(headers["x-mock-delay"] ?? 120_000), parts: [{ text: "Starting " }] };
    default:
      return { parts: [{ text: "Here is a short plan: keep the first clip." }, { tool: "keepClip", args: JSON.stringify({ clipId: firstClip }), split: 6 }] };
  }
}

const sse = (res, obj) => res.write(`data: ${typeof obj === "string" ? obj : JSON.stringify(obj)}\n\n`);

export async function startMock({ host = "127.0.0.1", port = 0 } = {}) {
  const requests = [];
  const state = { sentBytes: 0 };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const url = new URL(req.url ?? "/", "http://mock");
      if (req.method === "GET" && url.pathname === "/v1/models") {
        requests.push({ path: url.pathname, method: "GET", headers: req.headers, raw: "", body: null, mode: null });
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ object: "list", data: ["normal", "evil", "inject", "image", "slow", "huge"].map((id) => ({ id: `${id}:free`, object: "model" })) }));
      }
      if (req.method !== "POST" || url.pathname !== "/v1/chat/completions") {
        requests.push({ path: url.pathname, method: req.method, headers: req.headers, raw, body: null, mode: null });
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "not found" } }));
      }
      let body;
      try { body = JSON.parse(raw); } catch { body = {}; }
      const mode = modeOf(req.headers, body);
      requests.push({ path: url.pathname, method: "POST", headers: req.headers, raw, body, mode });
      if (mode === "429") {
        res.writeHead(429, { "content-type": "application/json", "retry-after": "2" });
        return res.end(JSON.stringify({ error: { message: "rate limited", type: "rate_limit" } }));
      }
      if (mode === "400") {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "bad request", type: "invalid_request_error" } }));
      }
      const plan = script(mode, body, req.headers);
      const id = `chatcmpl-${requests.length}`;
      const model = body.model ?? "mock";
      const base = { id, object: "chat.completion.chunk", created: 0, model };
      const chunk = (delta, finish = null) => ({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] });
      const usage = { prompt_tokens: Math.ceil(raw.length / 4), completion_tokens: 20, total_tokens: Math.ceil(raw.length / 4) + 20 };
      let closed = false;
      res.on("close", () => { closed = true; });
      if (!body.stream) {
        const t = (plan.parts ?? []).filter((p) => p.text).map((p) => p.text).join("");
        const calls = (plan.parts ?? []).filter((p) => p.tool).map((p, i) => ({ id: `call_${i}`, type: "function", function: { name: p.tool, arguments: p.args } }));
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ...base, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: t, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: calls.length ? "tool_calls" : "stop" }], usage }));
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      sse(res, chunk({ role: "assistant", content: "" }));
      if (plan.huge) {
        const piece = "x".repeat(64 * 1024);
        for (let sent = 0; sent < plan.huge && !closed; sent += piece.length) {
          state.sentBytes += piece.length;
          if (!res.write(`data: ${JSON.stringify(chunk({ content: piece }))}\n\n`)) await new Promise((r) => { const done = () => { res.off("drain", done); res.off("close", done); r(); }; res.once("drain", done); res.once("close", done); });
        }
        if (!closed) res.end();
        return;
      }
      let toolIndex = 0;
      for (const part of plan.parts ?? []) {
        if (closed) return;
        if (part.text !== undefined) sse(res, chunk({ content: part.text }));
        else {
          const i = toolIndex++;
          sse(res, chunk({ tool_calls: [{ index: i, id: `call_${i}`, type: "function", function: { name: part.tool, arguments: "" } }] }));
          for (const piece of split(part.args, part.split ?? 16)) sse(res, chunk({ tool_calls: [{ index: i, function: { arguments: piece } }] }));
        }
      }
      if (plan.slow) {
        // Hold the stream open until the client goes away or the delay passes.
        await new Promise((r) => { const t = setTimeout(r, plan.slow); res.once("close", () => { clearTimeout(t); r(); }); });
        if (closed) return;
      }
      sse(res, chunk({}, toolIndex ? "tool_calls" : "stop"));
      if (mode !== "no_usage") sse(res, { ...base, choices: [], usage });
      sse(res, "[DONE]");
      res.end();
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  const addr = server.address();
  return {
    url: `http://${host}:${addr.port}/v1`,
    port: addr.port,
    requests,
    state,
    reset() { requests.length = 0; state.sentBytes = 0; },
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}

// `node e2e/mock-llm.mjs [port]` runs it standalone, so promptfoo or curl can reach it.
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "\0")) {
  const m = await startMock({ port: Number(process.argv[2] ?? 0) });
  console.log(`mock-llm listening on ${m.url}`);
}
