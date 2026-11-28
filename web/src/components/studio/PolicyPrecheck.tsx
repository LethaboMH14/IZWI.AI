"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PolicyPlatform, PolicyResult } from "@/lib/platform-policy";

const PLATFORMS: { id: PolicyPlatform; name: string }[] = [{ id: "youtube", name: "YouTube" }, { id: "tiktok", name: "TikTok" }, { id: "instagram", name: "Instagram" }, { id: "facebook", name: "Facebook" }];
export function PolicyPrecheck({ outputId }: { outputId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<PolicyPlatform[]>(["youtube"]);
  const [results, setResults] = useState<PolicyResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { void api<{ enabled: boolean }>("/api/policy-check").then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false)); }, []);
  if (!enabled) return null;
  const toggle = (platform: PolicyPlatform) => setSelected((current) => current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform]);
  const check = async () => {
    if (!selected.length) return;
    setBusy(true); setMessage("");
    try { const response = await api<{ results: PolicyResult[] }>("/api/policy-check", { method: "POST", body: { outputId, platforms: selected } }); setResults(response.results); setMessage("Pre-check saved. Review every finding before you share."); }
    catch (error) { setMessage((error as Error).message || "Could not run the pre-check."); }
    finally { setBusy(false); }
  };
  return <section className="st-policy" aria-label="Platform policy pre-check">
    <h3>Policy pre-check</h3>
    <p>This limited pre-check is not a guarantee that a platform will accept the video. It does not inspect video, audio, thumbnail text or metadata with an AI reviewer.</p>
    <fieldset><legend>Check for</legend>{PLATFORMS.map((platform) => <label key={platform.id}><input type="checkbox" checked={selected.includes(platform.id)} onChange={() => toggle(platform.id)} />{platform.name}</label>)}</fieldset>
    <button type="button" className="btn btn-sm" disabled={busy || !selected.length} onClick={() => void check()}>{busy ? "Checking…" : "Run policy pre-check"}</button>
    {message && <p role="status">{message}</p>}
    {results.map((result) => <article key={result.platform}><h4>{result.platform}: {result.status === "pass" ? "Pass" : result.status === "block" ? "Block" : "Review"}</h4><ul>{result.findings.map((finding) => <li key={`${finding.field}-${finding.rule}`}><b>{finding.field}:</b> {finding.explanation} <a href={finding.sourceUrl} target="_blank" rel="noreferrer">{finding.rule} (checked {finding.checkedAt})</a></li>)}</ul></article>)}
  </section>;
}
