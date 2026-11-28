"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { STARTER_TEMPLATES, type StarterTemplate } from "@/lib/starter-templates";

export function StarterTemplateLibrary({ compact = false, instance = "default", onApply }: { compact?: boolean; instance?: string; onApply?: (template: StarterTemplate, outline: string) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [chosen, setChosen] = useState<StarterTemplate | null>(null);
  const [outline, setOutline] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { void api<{ enabled: boolean }>("/api/starter-templates").then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false)); }, []);
  if (!enabled) return null;
  const apply = (template: StarterTemplate) => {
    setChosen(template); setSaved(false);
    setOutline(`${template.titlePattern}\n\nHook: ${template.hook}\nStory: ${template.story}\nCall to action: ${template.callToAction}\nCaption style: ${template.captionStyle}\nSuggested clip: ${template.clipSeconds}s · ${template.aspect}\nDescription: ${template.descriptionPattern}`);
  };
  return <section className="st-templates" aria-label="Starter templates">
    <h2>Starter templates</h2><p>Editable starting points. No view or earnings claims; your existing work is never replaced.</p>
    <div className="st-template-grid">{STARTER_TEMPLATES.map((template) => <button type="button" key={template.id} aria-pressed={chosen?.id === template.id} onClick={() => apply(template)}><b>{template.niche}</b><span>{template.title}</span></button>)}</div>
    {chosen && <div className="st-template-outline"><label htmlFor={`starter-outline-${instance}`}>Editable outline draft · {chosen.niche}</label><textarea id={`starter-outline-${instance}`} rows={compact ? 5 : 8} value={outline} onChange={(e) => { setOutline(e.target.value); setSaved(false); }} /><div className="st-actions"><button type="button" className="btn btn-sm" onClick={() => { onApply?.(chosen, outline); setSaved(true); }}>{onApply ? "Use this outline" : "Keep this draft here"}</button></div>{saved && <p role="status">Outline is ready to edit. Choose where you want to use it.</p>}</div>}
  </section>;
}
