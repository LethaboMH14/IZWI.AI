"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { GREETINGS } from "@/lib/greetings";

export function LanguagesPanel({ initial }: { initial: string[] }) {
  const [selected, setSelected] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const save = async () => {
    if (!selected.length) { setMessage("Choose at least one language."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await api<{ languages: string[] }>("/api/settings/languages", { method: "PATCH", body: { languages: selected } });
      setSelected(result.languages); setMessage("Greeting languages saved.");
    } catch (error) { setMessage((error as Error).message || "Could not save languages."); }
    finally { setBusy(false); }
  };
  return <section className="st-sec" aria-labelledby="languages-h">
    <header><div><h2 id="languages-h">Languages you use</h2><p>Choose the languages you know and use. Your Home greeting will rotate among them; the rest of the interface remains in English.</p></div></header>
    <fieldset className="language-options"><legend>Greeting languages</legend>{GREETINGS.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /><span>{item.name} — {item.text}</span><small>{item.review}</small></label>)}</fieldset>
    <div className="st-actions"><button type="button" className="btn btn-lg" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save languages"}</button></div>
    {message && <p role="status" className="st-note">{message}</p>}
    <p className="st-note">Consent and rights screens remain in English until reviewed translations are available.</p>
  </section>;
}
