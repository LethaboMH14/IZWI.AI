"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export function SeasonalSettingsPanel({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [message, setMessage] = useState("");
  const save = async (value: boolean) => {
    setEnabled(value); setMessage("");
    try { await api("/api/settings/seasonal", { method: "PATCH", body: { enabled: value } }); setMessage(value ? "Seasonal suggestions are on." : "Seasonal suggestions are off."); }
    catch (error) { setEnabled(!value); setMessage((error as Error).message || "Could not save this setting."); }
  };
  return <section className="st-sec" aria-labelledby="seasonal-h"><header><div><h2 id="seasonal-h">Seasonal suggestions</h2><p>Choose whether Home can offer calendar-based seasonal looks and content ideas. It will never switch your look automatically.</p></div></header><label className="field"><span><input type="checkbox" checked={enabled} onChange={(e) => void save(e.target.checked)} /> Show seasonal suggestions on Home</span></label>{message && <p role="status" className="st-note">{message}</p>}</section>;
}
