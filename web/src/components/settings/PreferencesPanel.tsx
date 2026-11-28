"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type Preferences = { theme: "approved" | "warm" | "high-contrast"; accent: "amber" | "terracotta" | "forest" | "ocean"; fontPair: "project" | "clean"; textSize: "standard" | "large" | "larger"; reducedMotion: boolean };
const DEFAULT: Preferences = { theme: "approved", accent: "amber", fontPair: "project", textSize: "standard", reducedMotion: false };
const themes = [{ id: "approved", name: "Approved look" }, { id: "warm", name: "Warm paper" }, { id: "high-contrast", name: "High contrast" }] as const;
const accents = [{ id: "amber", name: "Amber" }, { id: "terracotta", name: "Terracotta" }, { id: "forest", name: "Forest" }, { id: "ocean", name: "Ocean" }] as const;

function previewAppearance(value: Preferences) {
  const shell = document.querySelector<HTMLElement>(".z-shell");
  if (!shell) return;
  shell.dataset.izwiTheme = value.theme;
  shell.dataset.izwiAccent = value.accent;
  shell.dataset.izwiFont = value.fontPair;
  shell.dataset.izwiTextSize = value.textSize;
  shell.dataset.izwiMotion = value.reducedMotion ? "reduced" : "normal";
}

export function PreferencesPanel({ initial }: { initial: Preferences }) {
  const [value, setValue] = useState<Preferences>(initial);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const change = (delta: Partial<Preferences>) => {
    const next = { ...value, ...delta };
    setValue(next); setMessage(""); previewAppearance(next);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const saved = await api<Preferences>("/api/settings/preferences", { method: "PATCH", body: value });
      setValue(saved); previewAppearance(saved); setMessage("Preferences saved to your account.");
    } catch (error) { setMessage((error as Error).message || "Could not save preferences."); }
    finally { setBusy(false); }
  };
  const reset = () => { setValue(DEFAULT); previewAppearance(DEFAULT); setMessage("Default look previewed. Save to keep it."); };

  return <section className="st-sec" aria-labelledby="preferences-h">
    <header><div><h2 id="preferences-h">Preferences</h2><p>These choices apply to your account. The preview updates as you change them; save when it feels right.</p></div></header>
    <form className="preferences-layout" onSubmit={(e) => void save(e)}>
      <div className="preferences-controls">
        <label className="field"><span>Theme</span><select value={value.theme} onChange={(e) => change({ theme: e.target.value as Preferences["theme"] })}>{themes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Accent colour</span><select value={value.accent} onChange={(e) => change({ accent: e.target.value as Preferences["accent"] })}>{accents.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Font pairing</span><select value={value.fontPair} onChange={(e) => change({ fontPair: e.target.value as Preferences["fontPair"] })}><option value="project">Fraunces + Instrument Sans + Geist Mono</option><option value="clean">Instrument Sans throughout + Geist Mono</option></select><small>Both pairings use the project&apos;s self-hosted fonts; no browser request to Google Fonts.</small></label>
        <label className="field"><span>Text size</span><select value={value.textSize} onChange={(e) => change({ textSize: e.target.value as Preferences["textSize"] })}><option value="standard">Standard</option><option value="large">Large</option><option value="larger">Larger</option></select></label>
        <label className="field"><span><input type="checkbox" checked={value.reducedMotion} onChange={(e) => change({ reducedMotion: e.target.checked })} /> Reduce motion</span><small>Animations and scrolling transitions are reduced across the studio.</small></label>
        <div className="st-actions"><button className="btn btn-lg" disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button><button type="button" className="btn btn-quiet" onClick={reset} disabled={busy}>Preview default</button></div>
        {message && <p role="status" className="st-note">{message}</p>}
      </div>
      <aside className="preferences-preview" aria-label="Live preview">
        <span className="fine">Live preview</span>
        <h3>Make your story yours</h3>
        <p>Ivory work panels, a charcoal shell, and an accent you chose.</p>
        <div className="preview-panel"><b>Story in progress</b><span>Transcript · reviewed</span><button type="button" className="btn">Save a change</button></div>
        <small>Spatial Canvas and Story Room keep their dark surfaces.</small>
      </aside>
    </form>
  </section>;
}
