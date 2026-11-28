"use client";

import { useEffect, useState } from "react";
import { ArrowClockwise, Key, Plus, Trash } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { ago } from "@/lib/format";
import { ModelList, type Model } from "@/components/engine/ModelList";

type Kind = "openai_compat" | "madlad_endpoint" | "asr_endpoint" | "openrouter" | "groq" | "gemini" | "aimlapi" | "ollama" | "meta";
type Role = "plan" | "translate" | "clips" | "asr" | "chat";
type Provider = { id: string; kind: Kind; label: string; baseUrl: string; model: string | null; keyHint: string | null; freeTier: boolean; roles: Role[]; privacy: "private" | "standard" | "may_log"; lastTestAt: number | null; lastTestOk: boolean | null; lastTestNote: string | null };
type Preset = { id: string; name: string; kind: Kind; label: string; baseUrl: string; roles: Role[]; keyOptional?: boolean; modelHint?: string; href?: string; hrefText?: string };

const roles: { id: Role; label: string }[] = [
  { id: "plan", label: "Planning" }, { id: "translate", label: "Translation" }, { id: "chat", label: "Studio assistant" },
];
const ROLE_LABEL: Partial<Record<Role, string>> = Object.fromEntries(roles.map((r) => [r.id, r.label]));
const KIND_LABEL: Record<Kind, string> = { openai_compat: "OpenAI-compatible chat", madlad_endpoint: "MADLAD-400 endpoint", asr_endpoint: "Speech endpoint", openrouter: "OpenRouter", groq: "Groq", gemini: "Gemini", aimlapi: "AI/ML API", ollama: "Ollama", meta: "Meta Model API (Standard mode)" };
const PRIVACY_TEXT: Record<Provider["privacy"], string> = {
  private: "Private · requests stay on this machine unless your local Ollama setup forwards them",
  standard: "Standard · requests are sent to Meta Model API",
  may_log: "May log · requests leave this computer and the provider may retain them",
};
const PRESETS: Preset[] = [
  { id: "ollama", name: "Ollama", kind: "ollama", label: "Ollama (this computer)", baseUrl: "http://127.0.0.1:11434/v1", roles: ["plan", "translate", "chat"], keyOptional: true, href: "https://ollama.com/download", hrefText: "Download Ollama" },
  { id: "groq", name: "Groq", kind: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", roles: ["plan", "translate", "chat"], href: "https://console.groq.com/keys", hrefText: "Get a Groq key" },
  { id: "gemini", name: "Gemini", kind: "gemini", label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", roles: ["plan", "translate", "chat"], href: "https://aistudio.google.com/app/apikey", hrefText: "Get a Gemini key" },
  { id: "meta", name: "Meta Model API", kind: "meta", label: "Meta Model API (Standard mode)", baseUrl: "https://api.meta.ai/v1", roles: ["plan", "translate", "chat"], href: "https://dev.meta.ai/", hrefText: "Get a Meta Model API key" },
  { id: "openrouter", name: "OpenRouter", kind: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", roles: ["plan", "translate", "chat"], href: "https://openrouter.ai/keys", hrefText: "Get an OpenRouter key" },
  { id: "aimlapi", name: "AI/ML API", kind: "aimlapi", label: "AI/ML API", baseUrl: "https://api.aimlapi.com/v1", roles: ["plan", "translate", "chat"], href: "https://aimlapi.com/app/keys", hrefText: "Get an AI/ML API key" },
];
const CUSTOM_PRESET: Preset = { id: "custom", name: "Custom OpenAI-compatible", kind: "openai_compat", label: "", baseUrl: "", roles: ["plan", "translate", "chat"], hrefText: "" };

function failureHelp(note: string) {
  if (/key|401|403/i.test(note)) return "Check that the key belongs to this provider and paste it again. Remove this failed connection first if IZWI already saved it.";
  if (/model|404/i.test(note)) return "Load models again and choose a model available to this account.";
  if (/429|rate/i.test(note)) return "The provider is rate-limiting requests. Wait a little, then try the test again.";
  return "Check the provider status and connection, then remove this failed connection and try again.";
}

function ProviderCard({ p, onChange, canManage }: { p: Provider; onChange: () => void; canManage: boolean }) {
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [msg, setMsg] = useState("");
  const retest = async () => {
    setBusy(true); setMsg("");
    try { const result = await api<Provider>(`/api/providers/${p.id}`, { method: "POST" }); setMsg(result.lastTestOk ? "Connection test passed." : `Connection test failed. ${result.lastTestNote ?? "Check the key and model."} ${failureHelp(result.lastTestNote ?? "")}`); onChange(); }
    catch (e) { setMsg(errorText(e, true)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setMsg("");
    try { await api(`/api/providers/${p.id}`, { method: "DELETE" }); onChange(); }
    catch (e) { setMsg(errorText(e, true)); setConfirm(false); }
    finally { setBusy(false); }
  };
  const status = p.lastTestOk === null ? "Not tested" : p.lastTestOk ? "Test passed" : "Test failed";
  return <li className="st-card">
    <div className="st-card-top"><h3>{p.label}</h3><span className={`pill ${p.lastTestOk ? "s-done" : p.lastTestOk === false ? "s-blocked" : "s-off"}`}>{status}</span></div>
    <dl><div><dt>Kind</dt><dd>{KIND_LABEL[p.kind]}</dd></div><div><dt>Privacy</dt><dd>{PRIVACY_TEXT[p.privacy]}</dd></div><div><dt>Address</dt><dd className="mono">{p.baseUrl}</dd></div>{p.model && <div><dt>Model</dt><dd>{p.model}</dd></div>}<div><dt>Key</dt><dd>{p.keyHint ? `Stored · ends in ${p.keyHint}` : "No key stored"}</dd></div><div><dt>Tasks</dt><dd>{p.roles.filter((r) => ROLE_LABEL[r]).map((r) => ROLE_LABEL[r]).join(", ") || "No supported provider tasks assigned"}</dd></div></dl>
    {p.lastTestAt && <p className="st-test">{p.lastTestNote} · {ago(p.lastTestAt)}</p>}
    {msg && <p className="st-note" role="status">{msg}</p>}
    {canManage && <div className="st-actions"><button className="btn btn-quiet" onClick={() => void retest()} disabled={busy}><ArrowClockwise weight="bold" /> {busy ? "Testing…" : "Test again"}</button>{confirm ? <span className="st-confirm">Remove this connection? <button className="btn st-danger" onClick={() => void remove()} disabled={busy}>Remove</button><button className="btn btn-quiet" onClick={() => setConfirm(false)}>Keep it</button></span> : <button className="btn btn-quiet" onClick={() => setConfirm(true)} disabled={busy}><Trash weight="bold" /> Remove</button>}</div>}
  </li>;
}

function errorText(e: unknown, adminAction = false) {
  if (e instanceof ApiError) {
    if (e.status === 403) return adminAction ? "Only workspace owners and admins can manage provider connections." : "You do not have permission to do that.";
    if (e.status === 401) return "You are signed out. Sign in again.";
    return e.message;
  }
  return (e as Error).message || "Something went wrong.";
}

function AddProvider({ onAdded, guided }: { onAdded: () => void; guided: boolean }) {
  const [preset, setPreset] = useState<Preset | null>(null), [model, setModel] = useState("");
  const [key, setKey] = useState(""), [rolesSelected, setRoles] = useState<Role[]>([]), [customLabel, setCustomLabel] = useState(""), [customBaseUrl, setCustomBaseUrl] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState<Provider | null>(null);
  const [freeTier, setFreeTier] = useState(false), [canFreeTier, setCanFreeTier] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  useEffect(() => { api<{ canFreeTier: boolean }>("/api/providers/routes").then((v) => setCanFreeTier(v.canFreeTier)).catch(() => {}); }, []);
  const pick = (p: Preset) => { setPreset(p); setRoles(p.roles); setModel(""); setKey(""); setFreeTier(false); setError(""); setResult(null); setCustomLabel(""); setCustomBaseUrl(""); setShowWizard(true); };
  const toggle = (role: Role) => setRoles((cur) => cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!preset || !model || !rolesSelected.length) { setError("Load and choose a model, then choose at least one task."); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const saved = await api<Provider>("/api/providers", { method: "POST", body: { kind: preset.kind, label: preset.kind === "openai_compat" ? customLabel.trim() : preset.label, baseUrl: preset.kind === "openai_compat" ? customBaseUrl.trim() : preset.baseUrl, model, key: key.trim() || undefined, roles: rolesSelected, freeTier } });
      setResult(saved); setKey(""); onAdded(); window.dispatchEvent(new Event("izwi:providers-changed"));
    } catch (e) { setError(errorText(e, true)); }
    finally { setBusy(false); }
  };

  return <section className="st-sec" aria-labelledby={guided ? "connect-new" : "add-provider"}>
    <header><div><h2 id={guided ? "connect-new" : "add-provider"}>{guided ? "Connect a provider" : "Add an advanced connection"}</h2><p>{guided ? "Choose one provider to start. Local and open tools are listed first." : "The advanced provider setup uses the same secure provider API."}</p></div></header>
    {!showWizard ? <>
      <div className="connections-groups">
        <section className="connections-group"><h3>Free, runs on this computer</h3><p>Ollama runs language models. whisper.cpp (MIT) transcribes audio on the local worker; audio stays on that computer and needs no provider key. Local Ollama has no provider fee (R0); electricity and hardware are yours. Its Private label cannot tell whether a custom local setup forwards requests.</p><div className="st-actions"><a className="btn btn-quiet" href="https://ollama.com/download" target="_blank" rel="noreferrer">Download Ollama</a><a className="btn btn-quiet" href="https://github.com/ggml-org/whisper.cpp" target="_blank" rel="noreferrer">whisper.cpp on GitHub</a><button type="button" className="btn" onClick={() => pick(PRESETS[0])}>Connect Ollama</button><a className="btn btn-quiet" href="/app/engine#worker">Check local worker</a></div></section>
        <section className="connections-group"><h3>Free tier online</h3><p>Hosted models for planning, translation and the studio assistant. May log: text leaves this computer and provider terms apply. Free limits can change.</p><div className="st-actions">{PRESETS.slice(1, 3).map((p) => <button type="button" className="btn btn-quiet" key={p.id} onClick={() => pick(p)}>Connect {p.name}</button>)}</div></section>
        <section className="connections-group"><h3>Paid online</h3><p>Hosted APIs charge by model and use. Standard for Meta Model API; May log for OpenRouter and AI/ML API. These are commercial services, not open-source software.</p><div className="st-actions">{PRESETS.slice(3).map((p) => <button type="button" className="btn btn-quiet" key={p.id} onClick={() => pick(p)}>Connect {p.name}</button>)}</div></section>
      </div>
    </> : preset && <>
      <button type="button" className="btn btn-quiet" onClick={() => { setShowWizard(false); setPreset(null); setResult(null); }}>← All connection options</button>
      <article className="connection-wizard">
        <h3>{preset.name}</h3><p><strong>Address:</strong> <code>{preset.baseUrl}</code></p>
        <p><strong>Privacy:</strong> {preset.kind === "ollama" ? PRIVACY_TEXT.private : preset.kind === "meta" ? PRIVACY_TEXT.standard : PRIVACY_TEXT.may_log}</p>
        {preset.href && <p><a href={preset.href} target="_blank" rel="noreferrer">{preset.hrefText}</a></p>}
        {preset.kind === "openai_compat" && <div className="st-two"><label className="field"><span>Connection name</span><input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} required maxLength={60} /></label><label className="field"><span>Base address</span><input value={customBaseUrl} onChange={(e) => { setCustomBaseUrl(e.target.value); setModel(""); }} required inputMode="url" placeholder="https://provider.example/v1" /></label></div>}
        {preset.kind !== "ollama" && <label className="field"><span>Provider key</span><input type="password" value={key} onChange={(e) => { setKey(e.target.value); setModel(""); }} autoComplete="off" spellCheck={false} required placeholder="Paste your key" /><small>The key is sent to IZWI over this connection, encrypted on the server, and never shown again.</small></label>}
        {preset.kind === "ollama" && <p className="st-note">No key is needed. Install and start Ollama on this computer. Download a model in Ollama before loading the list here.</p>}
        {canFreeTier && ["groq", "gemini", "openrouter"].includes(preset.kind) && <label className="field"><span><input type="checkbox" checked={freeTier} onChange={(e) => setFreeTier(e.target.checked)} /> I have confirmed this account has a free tier</span></label>}
        <ModelList key={`${preset.id}:${key}:${customBaseUrl}:${freeTier}`} preview={{ kind: preset.kind, ...(key ? { key } : {}), ...(preset.kind === "openai_compat" && customBaseUrl ? { baseUrl: customBaseUrl } : {}), freeTier }} onChoose={(m: Model) => setModel(m.id)} />
        {model && <p className="st-note" role="status">Selected model: <strong>{model}</strong>. Its Rand estimate is shown in the model list. Unknown means no reviewed or live price and Rand rate are available.</p>}
        <fieldset className="st-roles"><legend>Use this connection for</legend><div>{roles.map((r) => <label key={r.id}><input type="checkbox" checked={rolesSelected.includes(r.id)} onChange={() => toggle(r.id)} /> {r.label}</label>)}</div></fieldset>
        {error && <p className="st-note bad" role="alert">{error}</p>}
        {result && <div className={`st-note ${result.lastTestOk ? "good" : "bad"}`} role="status"><strong>{result.lastTestOk ? "Connection saved and test passed." : "Connection saved, but its test failed."}</strong><br />{result.lastTestNote || "No test details were returned."}{!result.lastTestOk && <p>{failureHelp(result.lastTestNote ?? "")}</p>}</div>}
        <form onSubmit={(e) => void submit(e)}><button className="btn btn-lg" disabled={busy || !model || (preset.kind !== "ollama" && !key.trim()) || (preset.kind === "openai_compat" && (!customBaseUrl.trim() || !customLabel.trim())) || !rolesSelected.length}><Plus weight="bold" /> {busy ? "Saving and testing…" : "Save and test"}</button></form>
      </article>
    </>}
    {!guided && !showWizard && <p className="st-note">For an OpenAI-compatible provider not listed above, <button type="button" className="link-button" onClick={() => pick(CUSTOM_PRESET)}>connect a custom address</button>.</p>}
    {result && !result.lastTestOk && <p className="st-note">This connection is saved so you can review it. Remove it below before retrying with a corrected key or model.</p>}
  </section>;
}

export function Keys({ guided = false }: { guided?: boolean }) {
  const { data, error, loading, refresh } = useLive<Provider[]>("/api/providers", { slowMs: 30_000 });
  const [canManage, setCanManage] = useState(false);
  useEffect(() => { api<{ canEdit: boolean }>("/api/providers/routes").then((v) => setCanManage(v.canEdit)).catch(() => setCanManage(false)); }, []);
  return <>
    {guided && <p className="st-note">Open models first: local Ollama (MIT) and whisper.cpp (MIT). For online providers, check what the provider may retain. Local Ollama is marked Private only for a loopback address.</p>}
    <section className="st-sec" aria-labelledby="keys-h"><header><div><h2 id="keys-h"><Key weight="bold" style={{ verticalAlign: "-3px" }} /> Your connected AI</h2><p>Keys are encrypted on this server. Only a provider that passes its connection test is used.</p></div></header>
      {loading && <div className="st-skel" aria-label="Loading" />}{error && !data && <p className="st-note bad" role="alert">Could not load connections. {error.message}</p>}
      {data && (data.length === 0 ? <p className="st-empty">No providers connected yet.</p> : <ul className="st-list">{data.map((p) => <ProviderCard key={p.id} p={p} onChange={refresh} canManage={canManage} />)}</ul>)}
      {!canManage && <p className="st-note">Only owners and admins can add, test or remove provider connections.</p>}
    </section>
    {canManage && <AddProvider onAdded={refresh} guided={guided} />}
  </>;
}

export { ProviderCard, AddProvider };
