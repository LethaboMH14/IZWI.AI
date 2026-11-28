"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export type Model = { id: string; label: string; contextTokens?: number; costTag: "Free" | "Cheap" | "Moderate" | "Expensive" | "Unknown"; estRandPerTurn?: number; rateAsOf?: string };

function costLabel(model: Model) {
  if (model.costTag === "Free") return "R0 · free";
  if (model.estRandPerTurn !== undefined) return `~R${model.estRandPerTurn} per typical turn${model.rateAsOf ? ` · rate ${model.rateAsOf}` : ""}`;
  return "price unknown";
}

export function ModelList({ id, onChoose, preview }: { id?: string; onChoose?: (m: Model) => void; preview?: { kind: string; key?: string; baseUrl?: string; freeTier?: boolean } }) {
  const [models, setModels] = useState<Model[]>([]), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true); setMsg("");
    try {
      const d = preview
        ? await api<{ models: Model[] }>("/api/providers/models", { method: "POST", body: preview })
        : await api<{ models: Model[] }>(`/api/providers/${id}/models`);
      setModels(d.models);
      if (!d.models.length) setMsg("No models were returned. Check that the provider has models available for this account.");
    } catch(e) { setMsg((e as Error).message || "Could not load models."); }
    finally { setBusy(false); }
  };
  return <div className="st-actions">
    <button type="button" className="btn btn-quiet" onClick={() => void load()} disabled={busy}>{busy ? "Loading models…" : "Load models"}</button>
    {models.length > 0 && <label className="field"><span>Choose model · estimated Rand per typical turn</span><select defaultValue="" onChange={e => { const model = models.find(m => m.id === e.target.value); if (model) onChoose?.(model); }}><option value="">Choose a model</option>{models.map(m => <option key={m.id} value={m.id}>{m.label} · {costLabel(m)}</option>)}</select></label>}
    {msg && <span role="status" className={models.length ? "st-note" : "st-note bad"}>{msg}</span>}
  </div>;
}
