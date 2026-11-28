"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { CREATOR_NICHES, NICHE_LABEL, type CreatorNiche } from "@/lib/niche-tips";

export function CreatorNicheSettings({ initial }: { initial: CreatorNiche }) {
  const [niche, setNiche] = useState(initial);
  const [message, setMessage] = useState("");
  const save = async () => {
    try { await api("/api/home-inspiration", { method: "PATCH", body: { niche } }); setMessage("Creator type saved for Home tips."); }
    catch (error) { setMessage((error as Error).message || "Could not save creator type."); }
  };
  return <section className="st-sec" aria-labelledby="creator-type-h"><header><div><h2 id="creator-type-h">Creator type</h2><p>Home tips use this category. You can change it at any time.</p></div></header><label className="field"><span>What do you mainly create?</span><select value={niche} onChange={(e) => setNiche(e.target.value as CreatorNiche)}>{CREATOR_NICHES.map((item) => <option key={item} value={item}>{NICHE_LABEL[item]}</option>)}</select></label><button type="button" className="btn btn-lg" onClick={() => void save()}>Save creator type</button>{message && <p role="status" className="st-note">{message}</p>}</section>;
}
