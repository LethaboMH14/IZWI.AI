"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { CREATOR_NICHES, NICHE_LABEL, NICHE_TIPS, type CreatorNiche } from "@/lib/niche-tips";

export function HomeInspiration({ initialNiche }: { initialNiche: CreatorNiche }) {
  const [niche, setNiche] = useState(initialNiche);
  const [message, setMessage] = useState("");
  const save = async () => {
    try { const result = await api<{ niche: CreatorNiche }>("/api/home-inspiration", { method: "PATCH", body: { niche } }); setNiche(result.niche); setMessage("Your Home tips now use this creator type."); }
    catch (error) { setMessage((error as Error).message || "Could not save this creator type."); }
  };
  return <section className="st-card st-home-inspiration" aria-label="Tips and inspiration">
    <h2>Tips for your {NICHE_LABEL[niche]} work</h2>
    <label>Creator type<select value={niche} onChange={(e) => setNiche(e.target.value as CreatorNiche)}>{CREATOR_NICHES.map((item) => <option key={item} value={item}>{NICHE_LABEL[item]}</option>)}</select></label>
    <ul>{NICHE_TIPS[niche].map((tip) => <li key={tip}>{tip}</li>)}</ul>
    {niche !== initialNiche && <button type="button" className="btn btn-sm" onClick={() => void save()}>Save creator type</button>}
    {message && <p role="status">{message}</p>}
    <div className="st-youtube-inspiration"><h3>Inspiration from YouTube</h3><p>No videos are shown. Connect your own YouTube account with read-only access before IZWI searches YouTube for your niche. That account connection is not available yet.</p></div>
  </section>;
}
