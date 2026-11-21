"use client";

import { useState } from "react";
import { connectors, type Connector } from "@/lib/platform";
import { useLive } from "@/lib/useLive";
import "../../settings.css";

type System = { worker: { online: boolean; seenAgoMs: number | null; info: { tools?: { ffmpeg?: string | null; whisper?: string | null } } | null }; files: { whisper: boolean; whisperModel: boolean; captionFont: boolean }; queue: Record<string, number> };
type Provider = { id: string; kind: "openai_compat" | "madlad_endpoint" | "asr_endpoint"; label: string; lastTestOk: boolean | null };

const stateClass = { "in use": "s-done", next: "s-draft", planned: "s-planned", "check licence": "s-blocked" } as const;
const stateText = { "in use": "In use", next: "Build next", planned: "Planned", "check licence": "Read licence first" } as const;
const groups = [...new Set(connectors.map((c) => c.group))];

// A part is "Working now" only when the system data proves it. Otherwise it says exactly what is missing.
type Verdict = { cls: string; text: string; why?: string };
function judge(c: Connector, sys: System | undefined, providers: Provider[] | undefined): Verdict {
  const base: Verdict = c.hosted ? { cls: "s-planned", text: "Planned (hosted mode)", why: "Not needed on this computer." } : { cls: stateClass[c.state], text: stateText[c.state] };
  switch (c.wired) {
    case "tus": return { cls: "s-done", text: "Working now", why: "Resumable uploads are served at /api/upload." };
    case "storage": return { cls: "s-done", text: "Working now", why: "Data is in a local SQLite file; media is in a local folder." };
    case "auth": return { cls: "s-done", text: "Working now", why: "You are signed in through it." };
    case "ffmpeg": {
      if (!sys) return { cls: "s-off", text: "Checking…" };
      const v = sys.worker.info?.tools?.ffmpeg;
      if (v) return { cls: "s-done", text: "Working now", why: `Worker reports version ${v}.` };
      return { cls: "s-off", text: "Not detected", why: sys.worker.online ? "The worker did not find FFmpeg." : "The worker is offline, so this cannot be checked." };
    }
    case "whisper": {
      if (!sys) return { cls: "s-off", text: "Checking…" };
      if (sys.files.whisper && sys.files.whisperModel) return { cls: "s-done", text: "Working now", why: "Program and model files are present." };
      const miss = [!sys.files.whisper && "program", !sys.files.whisperModel && "model"].filter(Boolean).join(" and ");
      return { cls: "s-off", text: "Not detected", why: `Missing: ${miss}.` };
    }
    case "openai_compat": case "madlad_endpoint": case "asr_endpoint": {
      if (!providers) return { cls: "s-off", text: "Checking…" };
      const mine = providers.filter((p) => p.kind === c.wired);
      const ok = mine.filter((p) => p.lastTestOk);
      if (ok.length) return { cls: "s-done", text: "Working now", why: `Test passed: ${ok.map((p) => p.label).join(", ")}.` };
      if (mine.length) return { cls: "s-blocked", text: "Test failed", why: `Added (${mine.map((p) => p.label).join(", ")}) but no test has passed.` };
      return { cls: stateClass[c.state], text: "Ready to connect", why: "Add it under Run on → Your own AI keys." };
    }
  }
  return base;
}

const ENDPOINTS: [string, string, string][] = [
  ["GET", "/api/workspace", "Workspace name, your role, preferences, glossary and usage"],
  ["PATCH", "/api/workspace", "Change workspace preferences"],
  ["POST", "/api/workspace", "Create the first workspace (onboarding)"],
  ["GET", "/api/projects", "List projects"],
  ["POST", "/api/projects", "Create a project"],
  ["GET", "/api/projects/:id", "Everything about one project"],
  ["PATCH", "/api/projects/:id", "Rename or change a project"],
  ["DELETE", "/api/projects/:id", "Delete a project (owner or admin)"],
  ["POST", "/api/projects/:id/run", "Start a job: transcribe, suggest clips, translate, package"],
  ["POST", "/api/projects/:id/clips", "Add a clip by hand"],
  ["POST", "/api/projects/:id/people", "Add a person who appears in the recording"],
  ["POST", "/api/projects/:id/consent", "Make a consent link to share"],
  ["POST", "/api/projects/:id/declare", "Record the creator declaration"],
  ["POST", "/api/projects/:id/links", "Make a review link"],
  ["POST", "/api/projects/:id/comments", "Add a comment, optionally at a time"],
  ["POST", "/api/projects/:id/outputs", "Ask for a render (blocked until consent allows)"],
  ["POST", "/api/projects/:id/listings", "Publish a licence listing for a ready render"],
  ["PATCH", "/api/items/clip/:id", "Edit or keep or drop a clip"],
  ["PATCH", "/api/items/line/:id", "Edit or approve a caption line"],
  ["PATCH", "/api/items/track/:id", "Approve every line of a caption track"],
  ["PATCH", "/api/items/output/:id", "Mark a render as posted"],
  ["DELETE", "/api/items/output/:id", "Remove a render that is not ready"],
  ["PATCH", "/api/items/listing/:id", "Switch a listing on or off"],
  ["PATCH", "/api/items/enquiry/:id", "Update a licence enquiry"],
  ["PATCH", "/api/items/comment/:id", "Resolve a comment"],
  ["PATCH", "/api/items/job/:id", "Cancel or retry a job"],
  ["DELETE", "/api/items/person/:id", "Remove a person"],
  ["DELETE", "/api/items/link/:id", "Revoke a review link"],
  ["POST", "/api/glossary", "Teach IZWI a spelling or fix a mishearing"],
  ["GET", "/api/plan", "Which planner is active"],
  ["POST", "/api/plan", "Plan steps from a sentence"],
  ["POST", "/api/plan/:id", "Approve or dismiss a plan"],
  ["GET", "/api/providers", "Your AI keys (never the key itself)"],
  ["POST", "/api/providers", "Add an AI key and test it"],
  ["POST", "/api/providers/:id", "Test a provider again"],
  ["DELETE", "/api/providers/:id", "Remove a provider"],
  ["GET", "/api/system", "Worker, tools, queue, storage and usage"],
  ["GET", "/api/team", "Members and pending invites"],
  ["POST", "/api/team", "Invite someone"],
  ["GET", "/api/media/:assetId", "Stream media (supports Range; add ?download to save)"],
  ["ANY", "/api/upload", "Resumable uploads (tus protocol)"],
  ["GET", "/api/public/review/:token", "Guest review room"],
  ["GET", "/api/public/consent/:token", "Guest consent page"],
  ["GET", "/api/public/listing/:slug", "Public licence listing"],
];

export default function Extensions() {
  const [pick, setPick] = useState("All");
  const sys = useLive<System>("/api/system", { slowMs: 8000 });
  const prov = useLive<Provider[]>("/api/providers", { slowMs: 30_000 });
  const rows = connectors.filter((c) => pick === "All" || c.group === pick);

  return (
    <div className="st-page">
      <header>
        <h1>Everything plugs <em>in.</em></h1>
        <p className="lede">IZWI is the workspace and the rules. The heavy lifting comes from open-source parts, each behind a small adapter so one can be swapped without touching the rest. A part says “Working now” only when this server can show it is.</p>
      </header>

      <div className="chips" role="tablist" aria-label="Filter by job">
        {["All", ...groups].map((g) => <button key={g} role="tab" aria-selected={pick === g} className={pick === g ? "on" : ""} onClick={() => setPick(g)}>{g}</button>)}
      </div>

      <section className="st-sec" aria-label="Parts">
        {(sys.error && !sys.data) && <p className="st-note bad" role="alert">Could not read the live system status, so parts that depend on it show as unverified. {sys.error.message}</p>}
        <div className="st-tablewrap">
          <table className="st-ext" style={{ marginTop: 0 }}>
            <thead><tr><th>Job</th><th>Part</th><th>Licence</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const v = judge(c, sys.data, prov.data);
                return (
                  <tr key={c.name}>
                    <td>{c.group}</td>
                    <th scope="row">{c.name}<span>{c.does}</span></th>
                    <td className="mono">{c.licence}</td>
                    <td><span className={`pill ${v.cls}`}>{v.text}</span>{v.why && <small>{v.why}</small>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="fine">“Build next” is a proposed order, not a decision. AGPL and GPL parts would run as separate services so their licence terms stay with them. Check each licence before you rely on it.</p>
      </section>

      <section className="st-sec" aria-labelledby="api-h">
        <header>
          <div>
            <h2 id="api-h">The API</h2>
            <p>Every call needs a signed-in session (a cookie), except the public guest pages. Errors come back as <code>{`{ "error": "…" }`}</code> with a status code.</p>
          </div>
        </header>
        <p className="st-live" role="status">
          <code>GET /api/system</code>
          {sys.data ? <span>answered just now: worker {sys.data.worker.online ? "online" : "offline"}, {Object.values(sys.data.queue).reduce((a, b) => a + b, 0)} jobs on record.</span> : sys.error ? <span>did not answer: {sys.error.message}</span> : <span>checking…</span>}
        </p>
        <ul className="st-endpoints">
          {ENDPOINTS.map(([m, p, d]) => <li key={m + p}><b>{m}</b><code>{p}</code><span>{d}</span></li>)}
        </ul>
      </section>
    </div>
  );
}
