"use client";

import { useEffect, useState } from "react";
import { Key, MagnifyingGlass, Fingerprint, Trash, ArrowClockwise, Plus } from "@phosphor-icons/react";
import { engines, estimateGb } from "@/lib/platform";
import { api, ApiError } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { ago, bytes } from "@/lib/format";
import { authClient } from "@/lib/auth-client";
import "../../settings.css";

/* ---------- This device (read in the browser, nothing leaves it) ---------- */
type Specs = { cores: number | null; memGb: number | null; gpu: string | null; webgpu: boolean; browser: string; freeGb: number | null; net: string | null; saveData: boolean };
type Nav = Navigator & { deviceMemory?: number; gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string; description?: string } } | null> }; connection?: { effectiveType?: string; saveData?: boolean } };

async function scan(): Promise<Specs> {
  const n = navigator as Nav;
  let gpu: string | null = null, webgpu = false;
  try {
    const a = await n.gpu?.requestAdapter();
    if (a) { webgpu = true; gpu = [a.info?.vendor, a.info?.architecture, a.info?.description].filter(Boolean).join(" ") || "Present, name hidden by the browser"; }
  } catch {}
  if (!gpu) {
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    } catch {}
  }
  let freeGb: number | null = null;
  try { const e = await navigator.storage?.estimate(); if (e?.quota) freeGb = Math.round(((e.quota - (e.usage ?? 0)) / 1e9) * 10) / 10; } catch {}
  const browserMatch = n.userAgent.match(/(Edg)\/([\d.]+)/) ?? n.userAgent.match(/(Firefox|Chrome|Version)\/([\d.]+)/);
  const browserNames: Record<string, string> = { Edg: "Edge", Firefox: "Firefox", Chrome: "Chrome", Version: "Safari" };
  const browser = browserMatch ? `${browserNames[browserMatch[1]]} ${browserMatch[2].split(".")[0]}` : "Name hidden by this browser";
  return { cores: navigator.hardwareConcurrency ?? null, memGb: n.deviceMemory ?? null, gpu, webgpu, browser, freeGb, net: n.connection?.effectiveType ?? null, saveData: !!n.connection?.saveData };
}

function DeviceCheck() {
  const [specs, setSpecs] = useState<Specs | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { setSpecs(await scan()); } finally { setBusy(false); } };

  const verdict = (need: number) => {
    if (!specs?.memGb) return { k: "off", t: "Memory unavailable" };
    // Browsers report at most 8 GB, so 8 means "8 or more".
    if (need <= specs.memGb * 0.5) return { k: "done", t: "May fit (estimate)" };
    if (need <= specs.memGb) return { k: "draft", t: specs.memGb >= 8 ? "Likely, if you have 16 GB" : "Tight" };
    return { k: "blocked", t: "May need more memory" };
  };

  return (
    <section className="st-sec device-check" aria-labelledby="dev-h">
      <header>
        <div>
          <h2 id="dev-h">Check this device</h2>
          <p>{specs ? "Read from your browser just now. Nothing was sent anywhere. These are browser readings, not a promise that a model will run." : "Not checked yet. The browser can report some device details; it cannot measure graphics memory or guarantee a model will run."}</p>
        </div>
        <button className="btn" onClick={run} disabled={busy}><MagnifyingGlass weight="bold" /> {busy ? "Checking…" : specs ? "Check again" : "Check this device"}</button>
      </header>
      {specs && (
        <dl className="st-grid device-results" aria-live="polite">
          <div><dt>Processor threads</dt><dd>{specs.cores ?? "Hidden"}</dd></div>
          <div><dt>Memory</dt><dd>{specs.memGb ? (specs.memGb >= 8 ? "8 GB or more" : `${specs.memGb} GB`) : "Hidden by this browser"}</dd></div>
          <div><dt>Graphics</dt><dd>{specs.gpu ?? "Not detected"}</dd></div>
          <div><dt>WebGPU</dt><dd>{specs.webgpu ? "Available in this browser" : "Not detected"}</dd></div>
          <div><dt>Browser</dt><dd>{specs.browser}</dd></div>
          <div><dt>Free space for models</dt><dd>{specs.freeGb ? `${specs.freeGb} GB available to this site` : "Unknown"}</dd></div>
          <div><dt>Connection</dt><dd>{specs.net ? `${specs.net.toUpperCase()}${specs.saveData ? ", data saver on" : ""}` : "Unknown"}</dd></div>
        </dl>
      )}
      <details className="device-models">
        <summary>Model details and memory estimates</summary>
        {!specs && <p className="st-note">Device not checked</p>}
      <div className="st-tablewrap">
        <table className="st-ext">
          <thead><tr><th>Job</th><th>Model</th><th>Licence</th><th>Estimated model memory</th>{specs && <th>On this device</th>}</tr></thead>
          <tbody>
            {engines.map((e) => {
              const need = estimateGb(e); const v = verdict(need);
              return (
                <tr key={e.id}>
                  <td>{e.job}</td>
                  <th scope="row">{e.name}<span>{e.note}</span></th>
                  <td className="mono">{e.licence}</td>
                  <td className="mono">{need} GB {e.needGb ? "(sourced)" : "(estimate)"}</td>
                  {specs && <td><span className={`pill s-${v.k}`}>{v.t}</span></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fine">Whisper memory figures are the “Required VRAM” column of the Whisper README. Figures marked “est.” are calculated from the parameter count on the model card. A browser cannot read graphics memory and reports at most 8 GB of RAM, so these verdicts are a first guess. These are not a guarantee of compatibility.</p>
      </details>
    </section>
  );
}

/* ---------- This computer's worker (live from /api/system) ---------- */
type System = {
  worker: { online: boolean; seenAgoMs: number | null; info: { tools?: { ffmpeg?: string | null; whisper?: string | null }; cpus?: number; memGb?: number } | null };
  files: { whisper: boolean; whisperModel: boolean; captionFont: boolean };
  queue: Record<string, number>;
  storageBytes: number;
  usage: { unit: string; provider: string; total: number }[];
};

const QUEUE_LABEL: Record<string, string> = { queued: "Waiting", running: "Running", done: "Finished", failed: "Failed", cancelled: "Cancelled", blocked: "Held" };
const unitText = (u: string, t: number) =>
  u === "audio_seconds" ? `${(t / 60).toFixed(1)} min of audio` : u === "tokens" ? `${Math.round(t).toLocaleString("en-ZA")} tokens` : `${Math.round(t).toLocaleString("en-ZA")} ${u.replace(/_/g, " ")}`;
const yn = (ok: boolean) => <span className={`pill ${ok ? "s-done" : "s-blocked"}`}>{ok ? "Found" : "Missing"}</span>;

function Worker() {
  const { data, error, loading } = useLive<System>("/api/system", { slowMs: 5000 });
  return (
    <section className="st-sec" aria-labelledby="wk-h" aria-live="polite">
      <header>
        <div>
          <h2 id="wk-h">This computer&apos;s worker</h2>
          <p>The worker does the heavy jobs: listening, cutting and rendering. It runs on the machine that hosts IZWI.</p>
        </div>
        {data && <span className={`pill ${data.worker.online ? "s-done" : "s-blocked"}`}>{data.worker.online ? "Worker online" : "Worker offline"}</span>}
      </header>
      {loading && <div className="st-skel" aria-label="Loading" />}
      {error && !data && <p className="st-note bad" role="alert">Could not read the system status. {error.message}</p>}
      {data && (
        <>
          {!data.worker.online && (
            <p className="st-note">
              {data.worker.seenAgoMs == null ? "No worker has ever reported in." : `Last seen ${Math.round(data.worker.seenAgoMs / 1000)} s ago.`} Start it in the project folder with <code>npm run worker</code> (or <code>npm run dev:all</code> to start the app and the worker together). Uploads still work, but nothing is processed until it runs.
            </p>
          )}
          <dl className="st-grid" style={{ marginTop: "1rem" }}>
            <div><dt>Last heard from</dt><dd>{data.worker.seenAgoMs == null ? "Never" : `${Math.round(data.worker.seenAgoMs / 1000)} s ago`}</dd></div>
            <div><dt>FFmpeg</dt><dd>{data.worker.info?.tools?.ffmpeg ?? (data.worker.info ? "Not found by the worker" : "Unknown while offline")}</dd></div>
            <div><dt>whisper.cpp</dt><dd>{data.worker.info?.tools?.whisper ?? (data.worker.info ? "Not found by the worker" : "Unknown while offline")}</dd></div>
            <div><dt>Storage used</dt><dd>{bytes(data.storageBytes)}</dd></div>
          </dl>
          <h3 style={{ marginTop: "1.2rem" }}>Files the worker needs</h3>
          <div className="st-pillrow">
            <span>Whisper program {yn(data.files.whisper)}</span>
            <span>Whisper model {yn(data.files.whisperModel)}</span>
            <span>Caption font {yn(data.files.captionFont)}</span>
          </div>
          <h3 style={{ marginTop: "1.2rem" }}>The queue</h3>
          {Object.keys(data.queue).length === 0 ? <p className="st-empty">No jobs yet.</p> : (
            <div className="st-pillrow">
              {Object.entries(data.queue).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => (
                <span key={k} className={`pill ${k === "failed" ? "s-blocked" : k === "done" ? "s-done" : k === "running" ? "s-draft" : "s-off"}`}>{QUEUE_LABEL[k] ?? k}: {n}</span>
              ))}
            </div>
          )}
          <h3 style={{ marginTop: "1.2rem" }}>Used in the last 30 days</h3>
          {data.usage.length === 0 ? <p className="st-empty">Nothing used yet.</p> : (
            <div className="st-tablewrap">
              <table className="st-usage">
                <thead><tr><th>Provider</th><th>Used</th></tr></thead>
                <tbody>{[...data.usage].sort((a, b) => a.provider.localeCompare(b.provider) || a.unit.localeCompare(b.unit)).map((u) => <tr key={u.unit + u.provider}><td>{u.provider}</td><td>{unitText(u.unit, u.total)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- Your own AI keys ---------- */
type Kind = "openai_compat" | "madlad_endpoint" | "asr_endpoint";
type Role = "plan" | "translate" | "clips" | "asr";
type Provider = { id: string; kind: Kind; label: string; baseUrl: string; model: string | null; keyHint: string | null; roles: Role[]; lastTestAt: number | null; lastTestOk: boolean | null; lastTestNote: string | null };

const KIND_LABEL: Record<Kind, string> = { openai_compat: "OpenAI-compatible chat", madlad_endpoint: "MADLAD-400 endpoint", asr_endpoint: "Speech endpoint" };
const ROLE_LABEL: Record<Role, string> = { plan: "Plan", translate: "Translate", clips: "Find clips", asr: "Transcribe" };

type Preset = { id: string; name: string; kind: Kind; label: string; baseUrl: string; modelHint: string; roles: Role[]; keyOptional?: boolean; note?: string };
const PRESETS: Preset[] = [
  { id: "aiml", name: "AI/ML API", kind: "openai_compat", label: "AI/ML API", baseUrl: "https://api.aimlapi.com/v1", modelHint: "model id from your AI/ML API dashboard", roles: ["plan", "translate"] },
  { id: "meta", name: "Meta Llama API", kind: "openai_compat", label: "Meta Llama API", baseUrl: "https://api.llama.com/compat/v1", modelHint: "model id from Meta's docs", roles: ["plan", "translate"], note: "Check this address in Meta's docs; sources disagree." },
  { id: "ollama", name: "Ollama on this computer", kind: "openai_compat", label: "Ollama (this computer)", baseUrl: "http://localhost:11434/v1", modelHint: "a model you have pulled", roles: ["plan", "translate"], keyOptional: true, note: "No key needed. Big local models slow this PC down while they run." },
  { id: "madlad", name: "MADLAD-400 endpoint", kind: "madlad_endpoint", label: "MADLAD-400", baseUrl: "", modelHint: "", roles: ["translate"], keyOptional: true, note: "Paste the URL of an endpoint you deployed, for example on Hugging Face or Kaggle." },
  { id: "asr", name: "Speech endpoint", kind: "asr_endpoint", label: "Speech endpoint", baseUrl: "", modelHint: "", roles: ["asr"], keyOptional: true, note: "Paste the URL of a transcription endpoint that accepts a WAV file." },
];

const errText = (e: unknown, adminAction = false) => {
  if (e instanceof ApiError) {
    if (e.status === 403) return adminAction ? "Only owners and admins can change AI keys. Ask an owner or admin of this workspace." : "You do not have permission to do that.";
    if (e.status === 401) return "You are signed out. Sign in again.";
    return e.message;
  }
  return (e as Error).message || "Something went wrong.";
};

function ProviderCard({ p, onChange }: { p: Provider; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const retest = async () => {
    setBusy(true); setMsg("");
    try { await api(`/api/providers/${p.id}`, { method: "POST" }); onChange(); } catch (e) { setMsg(errText(e)); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true); setMsg("");
    try { await api(`/api/providers/${p.id}`, { method: "DELETE" }); onChange(); } catch (e) { setMsg(errText(e, true)); setConfirm(false); }
    setBusy(false);
  };
  const state = p.lastTestOk === null ? { k: "off", t: "Not tested" } : p.lastTestOk ? { k: "done", t: "Test passed" } : { k: "blocked", t: "Test failed" };
  return (
    <li className="st-card">
      <div className="st-card-top">
        <h3>{p.label}</h3>
        <span className={`pill s-${state.k}`}>{state.t}</span>
      </div>
      <dl>
        <div><dt>Kind</dt><dd>{KIND_LABEL[p.kind]}</dd></div>
        <div><dt>Address</dt><dd className="mono">{p.baseUrl}</dd></div>
        {p.model && <div><dt>Model</dt><dd>{p.model}</dd></div>}
        <div><dt>Key</dt><dd className="mono">{p.keyHint ? `ends in ${p.keyHint}` : "No key stored"}</dd></div>
        <div><dt>Used for</dt><dd>{p.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}</dd></div>
      </dl>
      {p.lastTestAt && <p className="st-test">{p.lastTestNote} <span className="mono">· {ago(p.lastTestAt)}</span></p>}
      {msg && <p className="st-note bad" role="alert">{msg}</p>}
      <div className="st-actions">
        <button className="btn btn-quiet" onClick={retest} disabled={busy}><ArrowClockwise weight="bold" /> {busy ? "Testing…" : "Test again"}</button>
        {confirm ? (
          <span className="st-confirm">Remove {p.label}?
            <button className="btn st-danger" onClick={remove} disabled={busy}>Yes, remove</button>
            <button className="btn btn-quiet" onClick={() => setConfirm(false)}>Keep it</button>
          </span>
        ) : (
          <button className="btn btn-quiet" onClick={() => setConfirm(true)} disabled={busy}><Trash weight="bold" /> Remove</button>
        )}
      </div>
    </li>
  );
}

function AddProvider({ onAdded }: { onAdded: () => void }) {
  const [preset, setPreset] = useState<Preset | null>(null);
  const [kind, setKind] = useState<Kind>("openai_compat");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Provider | null>(null);

  const pick = (p: Preset) => {
    setPreset(p); setKind(p.kind); setLabel(p.label); setBaseUrl(p.baseUrl); setModel(""); setRoles(p.roles); setError(""); setResult(null);
  };
  const toggle = (r: Role) => setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setResult(null);
    if (!roles.length) { setError("Pick at least one job for this provider."); return; }
    setBusy(true);
    try {
      const p = await api<Provider>("/api/providers", { method: "POST", body: { kind, label: label.trim(), baseUrl: baseUrl.trim(), model: model.trim() || undefined, key: key.trim() || undefined, roles } });
      setResult(p); setKey(""); onAdded();
    } catch (err) { setError(errText(err, true)); }
    setBusy(false);
  };

  return (
    <div style={{ marginTop: "1.4rem" }}>
      <h3>Add a provider</h3>
      <p className="st-note" style={{ marginTop: "0.4rem" }}>Your key is encrypted on this server and never shown again. Only its last few characters are kept so you can recognise it. Only owners and admins can add or remove keys.</p>
      <div className="st-presets" role="group" aria-label="Start from a preset">
        {PRESETS.map((p) => <button type="button" key={p.id} aria-pressed={preset?.id === p.id} onClick={() => pick(p)}>{p.name}</button>)}
        <button type="button" aria-pressed={preset === null && label !== ""} onClick={() => { setPreset(null); setKind("openai_compat"); setLabel(""); setBaseUrl(""); setModel(""); setRoles([]); setResult(null); setError(""); }}>Something else</button>
      </div>
      {preset?.note && <p className="st-note" role="note" style={{ marginBottom: "1rem" }}>{preset.note}</p>}
      <form className="st-form" onSubmit={submit} autoComplete="off">
        <div className="st-two">
          <label className="field"><span>Name</span><input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} placeholder="What you will call it" /></label>
          <label className="field"><span>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
        </div>
        <label className="field"><span>Address (base URL)</span><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required inputMode="url" placeholder={kind === "openai_compat" ? "https://…/v1" : "https://your-endpoint…"} /></label>
        {kind === "openai_compat" && <label className="field"><span>Model</span><input value={model} onChange={(e) => setModel(e.target.value)} required placeholder={preset?.modelHint || "the model id this provider gives you"} /></label>}
        <label className="field"><span>Key {preset?.keyOptional || kind !== "openai_compat" ? "(optional)" : ""}</span><input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste it here once" /><small>Encrypted on this server. Never shown again.</small></label>
        <fieldset className="st-roles">
          <legend>Use it for</legend>
          <div>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <label key={r}><input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} /> {ROLE_LABEL[r]}</label>)}</div>
        </fieldset>
        {error && <p className="st-note bad" role="alert">{error}</p>}
        {result && (
          <p className={`st-note ${result.lastTestOk ? "good" : "bad"}`} role="status">
            {result.lastTestOk ? "Added. The test passed." : "Added, but the test failed."} {result.lastTestNote}
          </p>
        )}
        <div><button className="btn btn-lg" disabled={busy}><Plus weight="bold" /> {busy ? "Adding and testing…" : "Add and test"}</button></div>
      </form>
    </div>
  );
}

function Keys() {
  const { data, error, loading, refresh } = useLive<Provider[]>("/api/providers", { slowMs: 30_000 });
  return (
    <section className="st-sec" aria-labelledby="keys-h">
      <header>
        <div>
          <h2 id="keys-h"><Key weight="bold" style={{ verticalAlign: "-3px" }} /> Your own AI keys</h2>
          <p>Bring your own key and IZWI uses your provider for planning and translation. You pay the provider directly. A provider only counts once its test passes.</p>
        </div>
      </header>
      {loading && <div className="st-skel" aria-label="Loading" />}
      {error && !data && <p className="st-note bad" role="alert">Could not load your providers. {error.message}</p>}
      {data && (data.length === 0 ? <p className="st-empty">No keys added yet. IZWI works without one; a key adds AI planning and translation.</p> : <ul className="st-list">{data.map((p) => <ProviderCard key={p.id} p={p} onChange={refresh} />)}</ul>)}
      <AddProvider onAdded={refresh} />
    </section>
  );
}

/* ---------- Passkeys ---------- */
type PasskeyRow = { id: string; name?: string | null; createdAt?: string | Date | null; deviceType?: string | null };

function Passkeys() {
  const [list, setList] = useState<PasskeyRow[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const load = async () => {
    try {
      const r = await authClient.passkey.listUserPasskeys();
      if (r.error) { setError(r.error.message || "Could not load your passkeys."); setList([]); return; }
      setList((r.data ?? []) as PasskeyRow[]); setError("");
    } catch (e) { setError((e as Error).message || "Could not load your passkeys."); setList([]); }
  };
  useEffect(() => { void Promise.resolve().then(load); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(""); setDone("");
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setError("This browser does not support passkeys. Try a recent Chrome, Edge, Safari or Firefox on a device with a screen lock."); setBusy(false); return;
    }
    try {
      const r = await authClient.passkey.addPasskey({ name: name.trim() || "My passkey" });
      if (r?.error) setError(r.error.message || "The passkey was not saved.");
      else { setDone("Passkey added."); setName(""); await load(); }
    } catch (err) {
      const m = (err as Error).name === "NotAllowedError" ? "The passkey request was cancelled or timed out." : (err as Error).message || "The passkey was not saved.";
      setError(m);
    }
    setBusy(false);
  };

  return (
    <section className="st-sec" aria-labelledby="pk-h">
      <header>
        <div>
          <h2 id="pk-h"><Fingerprint weight="bold" style={{ verticalAlign: "-3px" }} /> Passkeys</h2>
          <p>Sign in with your fingerprint, face or screen lock instead of a password. Each passkey belongs to this account.</p>
        </div>
      </header>
      {list === null ? <div className="st-skel" aria-label="Loading" /> : list.length === 0 ? <p className="st-empty">No passkeys yet.</p> : (
        <ul className="st-people">
          {list.map((p) => (
            <li key={p.id}><div><b>{p.name || "Unnamed passkey"}</b><span className="em">{p.deviceType ? `${p.deviceType.replace(/_/g, " ")} · ` : ""}{p.createdAt ? `added ${new Date(p.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span></div></li>
          ))}
        </ul>
      )}
      <form className="st-team-form" style={{ marginTop: "1rem" }} onSubmit={add}>
        <label className="field" style={{ gridColumn: "1 / span 2" }}><span>Name this passkey</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="For example, my phone" /></label>
        <button className="btn" disabled={busy}><Fingerprint weight="bold" /> {busy ? "Waiting for your device…" : "Add a passkey"}</button>
      </form>
      {error && <p className="st-note bad" role="alert" style={{ marginTop: "0.8rem" }}>{error}</p>}
      {done && <p className="st-note good" role="status" style={{ marginTop: "0.8rem" }}>{done}</p>}
    </section>
  );
}

export default function Engine() {
  return (
    <div className="st-page">
      <header>
        <h1>Where the AI <em>runs</em></h1>
        <p className="lede">IZWI works on this computer first. Check what your device can carry, see whether the worker is running, and add your own AI keys if you want more.</p>
      </header>
      <DeviceCheck />
      <Worker />
      <Keys />
      <Passkeys />
    </div>
  );
}
