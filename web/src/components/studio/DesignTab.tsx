"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { TabProps } from "./types";

type Artifact = "thumbnail" | "cover" | "poster" | "countdown" | "illustration";
type Draft = { id: string; artifact: Artifact; platform: string; headline: string; subtitle: string; accent: string; status: "draft" | "approved"; created_at?: number; approved_at?: number };
const kinds: { id: Artifact; label: string }[] = [{ id: "thumbnail", label: "Thumbnail" }, { id: "cover", label: "Cover" }, { id: "poster", label: "Poster" }, { id: "countdown", label: "Countdown poster" }, { id: "illustration", label: "Illustration card" }];

function downloadSvg(draft: Draft) {
  const preview = document.createElement("div");
  preview.className = "st-design-preview"; preview.dataset.accent = draft.accent; preview.style.position = "fixed"; preview.style.visibility = "hidden";
  document.body.append(preview);
  const style = getComputedStyle(preview);
  const accent = style.getPropertyValue("--design-accent").trim() || style.getPropertyValue("--amber").trim();
  const ink = style.getPropertyValue("--ink").trim() || "#211e1a";
  const ivory = style.getPropertyValue("--ivory").trim() || "#faf8f4";
  preview.remove();
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${ivory}"/><path d="M0 520 Q420 380 780 500 T1280 410 V720 H0Z" fill="${accent}"/><text x="88" y="235" fill="${ink}" font-family="sans-serif" font-size="72" font-weight="700">${escape(draft.headline)}</text><text x="92" y="315" fill="${ink}" font-family="sans-serif" font-size="36">${escape(draft.subtitle)}</text><text x="92" y="655" fill="${ivory}" font-family="sans-serif" font-size="20">Text-led mock-up · IZWI AI</text></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const link = document.createElement("a"); link.href = url; link.download = `izwi-${draft.artifact}.svg`; link.click(); URL.revokeObjectURL(url);
}

export function DesignTab({ state, refresh }: TabProps) {
  const [artifact, setArtifact] = useState<Artifact>("thumbnail");
  const [platform, setPlatform] = useState("youtube");
  const [headline, setHeadline] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [accent, setAccent] = useState("amber");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void api<{ drafts: Draft[] }>(`/api/projects/${state.project.id}/design`).then((result) => setDrafts(result.drafts)); }, [state.project.id]);
  const save = async () => {
    setBusy(true); setMessage("");
    try { const created = await api<Draft>(`/api/projects/${state.project.id}/design`, { method: "POST", body: { artifact, platform, headline, subtitle, accent } }); setDrafts((current) => [created, ...current]); setMessage("Editable design mock-up saved as a draft."); await refresh(); }
    catch (error) { setMessage((error as Error).message || "Could not save this mock-up."); }
    finally { setBusy(false); }
  };
  const approve = async (draft: Draft) => {
    try { await api(`/api/projects/${state.project.id}/design`, { method: "PATCH", body: { id: draft.id, action: "approve" } }); setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, status: "approved" } : item)); setMessage("You approved this text-led mock-up. Download it when ready."); }
    catch (error) { setMessage((error as Error).message || "Could not approve this mock-up."); }
  };
  return <div className="st st-design">
    <section className="st-card"><h2>Design a cover or poster</h2><p className="st-intro">Create an editable text-led SVG mock-up with accurate text. This is not AI image generation and does not create illustrations or people.</p>
      <div className="st-design-layout"><div className="st-design-form">
        <label>Output type<select value={artifact} onChange={(e) => setArtifact(e.target.value as Artifact)}>{kinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label>
        <label>Platform<select value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="general">General</option></select></label>
        <label>Headline<input maxLength={100} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="A short title" /></label>
        <label>Subtitle or date<input maxLength={180} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Optional detail" /></label>
        <label>Accent<select value={accent} onChange={(e) => setAccent(e.target.value)}><option value="amber">Amber</option><option value="terracotta">Terracotta</option><option value="forest">Forest</option><option value="ocean">Ocean</option></select></label>
        <button type="button" className="btn btn-lg" disabled={busy || !headline.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save design draft"}</button>
      </div><div className="st-design-preview" data-accent={accent} aria-label="Text-led SVG preview"><strong>{headline || "Your headline"}</strong><span>{subtitle || "Your subtitle or date"}</span><small>{artifact} · preview</small></div></div>
      {message && <p role="status">{message}</p>}
    </section>
    <section className="st-card"><h2>Saved designs</h2>{drafts.length ? <ul className="st-design-list">{drafts.map((draft) => <li key={draft.id}><div><b>{draft.headline}</b><span>{draft.artifact} · {draft.platform} · {draft.status === "approved" ? "Approved by you" : "Draft"}</span></div>{draft.status === "draft" ? <button type="button" className="btn btn-sm" onClick={() => void approve(draft)}>Approve mock-up</button> : <button type="button" className="btn btn-sm" onClick={() => downloadSvg(draft)}>Download SVG</button>}</li>)}</ul> : <p>No saved designs yet.</p>}</section>
    <section className="st-card"><h2>Image generation</h2><p>Not connected. FLUX.1 [schnell] is the selected open-weight model candidate, under Apache-2.0, to run locally through ComfyUI. The image provider role, output provenance record and image attachment approval path still need implementation.</p></section>
  </div>;
}
