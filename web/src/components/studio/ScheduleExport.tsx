"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

function southAfricaTime() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(Date.now() + 60 * 60_000));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function ScheduleExport({ outputId, title }: { outputId: string; title: string }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("youtube");
  const [postTitle, setPostTitle] = useState(title);
  const [dateTime, setDateTime] = useState(southAfricaTime);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api<{ enabled: boolean }>("/api/post-schedules").then((result) => setEnabled(result.enabled)).catch(() => setEnabled(false)); }, []);
  if (!enabled) return null;
  const prepare = async () => {
    setBusy(true); setMessage("");
    try {
      const scheduledAt = new Date(`${dateTime}:00+02:00`).getTime();
      const result = await api<Record<string, unknown>>("/api/post-schedules", { method: "POST", body: { outputId, platform, scheduledAt, timezone: "Africa/Johannesburg", title: postTitle, description, tags: tags.split(",").map((item) => item.trim()).filter(Boolean), acknowledgeReview: acknowledge } });
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `izwi-manual-post-${platform}.json`; anchor.click(); URL.revokeObjectURL(anchor.href);
      setMessage("Manual export prepared and downloaded. IZWI has not scheduled or posted it.");
    } catch (error) { setMessage((error as Error).message || "Could not prepare the manual export."); }
    finally { setBusy(false); }
  };
  return <section className="st-schedule"><h3>Schedule or export manually</h3><p>Platform posting is unavailable until developer apps and review are completed. This creates a manual export only.</p>
    {!open ? <button type="button" className="btn btn-sm btn-quiet" onClick={() => setOpen(true)}>Prepare a manual post</button> : <div className="st-schedule-form">
      <label>Platform<select value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select></label>
      <label>Planned time · South Africa<input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} /></label>
      <label>Title<input maxLength={120} value={postTitle} onChange={(e) => setPostTitle(e.target.value)} /></label>
      <label>Description<textarea maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label>Tags, separated by commas<input value={tags} onChange={(e) => setTags(e.target.value)} /></label>
      <label className="st-check"><input type="checkbox" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} />I reviewed the policy findings and accept responsibility for this post if the result is Review.</label>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void prepare()}>{busy ? "Preparing…" : "Export for manual posting"}</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
