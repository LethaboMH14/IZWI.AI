"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ModelList } from "@/components/engine/ModelList";

type Role = "chat" | "plan" | "translate";
type Data = { canEdit: boolean; canFreeTier?: boolean; routes: { role: Role; providerId: string; model: string }[]; providers: { id: string; label: string; model: string | null; roles: Role[]; ready: boolean }[] };
const labels: Record<Role, string> = { chat: "Assistant chat", plan: "Plan", translate: "Translate" };
export function ProviderRouting() {
  const [data, setData] = useState<Data | null>(null), [routeByRole, setRouteByRole] = useState<Record<string, string>>({}), [modelByRole, setModelByRole] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const refresh = () => api<Data>("/api/providers/routes").then(d => { const active = d.routes.filter(r => ["chat", "plan", "translate"].includes(r.role)); setData(d); setRouteByRole(Object.fromEntries(active.map(r => [r.role, r.providerId]))); setModelByRole(Object.fromEntries(active.map(r => [r.role, r.model]))); }).catch(e => setMsg((e as Error).message));
  useEffect(() => { void refresh(); const changed = () => { void refresh(); }; window.addEventListener("izwi:providers-changed", changed); return () => window.removeEventListener("izwi:providers-changed", changed); }, []);
  const save = async () => { setBusy(true); setMsg(""); try { const routes = Object.entries(routeByRole).filter(([, providerId]) => providerId).map(([role, providerId]) => ({ role, providerId, model: modelByRole[role] || data?.providers.find(p => p.id === providerId)?.model || "" })); await api("/api/providers/routes", { method: "PUT", body: { routes } }); setMsg("Task routes saved."); } catch(e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  if (!data) return <p className="st-note" role="status">Loading task routes…</p>;
  return <section className="st-sec" aria-labelledby="route-h"><header><div><h2 id="route-h">Choose a model for each task</h2><p>Only tested providers enabled for the task appear. Blank means the usual provider selection is used.</p></div></header>
    <div className="st-form">{(["chat", "plan", "translate"] as Role[]).map(role => <div key={role}><label className="field"><span>{labels[role]} provider</span><select value={routeByRole[role] ?? ""} onChange={e => { setRouteByRole({ ...routeByRole, [role]: e.target.value }); setModelByRole({ ...modelByRole, [role]: "" }); }} disabled={!data.canEdit}><option value="">Default</option>{data.providers.filter(p => p.ready && p.roles.includes(role)).map(p => <option key={p.id} value={p.id}>{p.label} · {p.model ?? "choose model"}</option>)}</select></label>{routeByRole[role] && <>{data.canEdit && <ModelList id={routeByRole[role]} onChoose={m => setModelByRole({ ...modelByRole, [role]: m.id })} />}<p className="st-note">Task model: {modelByRole[role] || data.providers.find(p => p.id === routeByRole[role])?.model || "choose from loaded models"}</p></>}</div>)}
    {data.canEdit && <button className="btn btn-lg" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save task routes"}</button>}{msg && <p className="st-note" role="status">{msg}</p>}</div></section>;
}

export { ModelList };
