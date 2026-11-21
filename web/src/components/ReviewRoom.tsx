"use client";

import { useRef, useState } from "react";
import { ChatCircleText, CheckCircle, Pause, Play, Warning } from "@phosphor-icons/react";
import { clock } from "@/lib/format";

export type RoomComment = { id: string; author: string; at_ms: number | null; body: string; kind: string; resolved_at: number | null };
export type RoomLine = { startMs: number; endMs: number; text: string; flag: string | null };
export type RoomFacts = { name: string | null; bytes: number | null; width: number | null; height: number | null; durationMs: number | null };

// A real player with notes pinned to the timecode, plus checks measured from the actual file and caption lines.
export function ReviewRoom({ src, poster, audioOnly, facts, comments, lines, onAddComment, onResolve }: {
  src: string | null;
  poster?: string | null;
  audioOnly: boolean;
  facts: RoomFacts;
  comments: RoomComment[];
  lines: RoomLine[];
  onAddComment: (atMs: number, body: string) => Promise<void>;
  onResolve: (id: string, resolved: boolean) => Promise<void>;
}) {
  const v = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [measured, setMeasured] = useState<{ w: number; h: number; d: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dur = (measured?.d ? measured.d * 1000 : facts.durationMs) || 1;
  const seek = (ms: number) => { if (v.current) { v.current.currentTime = ms / 1000; setT(ms); } };
  const add = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true); setErr(null);
    try { await onAddComment(Math.round(t), body); setDraft(""); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  // Checks that need no AI: measured from the file's metadata and the caption text. Nothing is guessed.
  const w = facts.width ?? measured?.w ?? 0, h = facts.height ?? measured?.h ?? 0;
  const ratio = w && h ? w / h : 0;
  const shape = !ratio ? "" : ratio < 0.7 ? "9:16 vertical" : ratio < 1.2 ? "1:1 square" : "16:9 wide";
  const fast = lines.filter((l) => l.endMs > l.startMs && l.text.replace(/\s+/g, " ").length / ((l.endMs - l.startMs) / 1000) > 17);
  const wide = lines.filter((l) => l.text.replace(/\n/g, " ").length > 84);
  const flagged = lines.filter((l) => l.flag);
  const checks: { ok: boolean; text: string; fix: string }[] = [];
  if (!audioOnly && w && h) checks.push({ ok: h >= 720 || w >= 720, text: `${w} × ${h}, ${shape}`, fix: "Below 720 on the short side. Platforms will soften it." });
  if (facts.durationMs) checks.push({ ok: facts.durationMs <= 90_000, text: `${clock(facts.durationMs)} long`, fix: "Over 90 seconds. Too long for most short-video feeds. Review the clips you cut from it instead." });
  if (lines.length) {
    checks.push({ ok: fast.length === 0, text: fast.length ? `Caption speed: ${fast.length} line${fast.length > 1 ? "s" : ""} above 17 characters a second` : "Caption speed: all lines readable", fix: `Split or shorten these: ${fast.slice(0, 4).map((l) => clock(l.startMs)).join(", ")}${fast.length > 4 ? "…" : ""}` });
    checks.push({ ok: wide.length === 0, text: wide.length ? `Caption length: ${wide.length} line${wide.length > 1 ? "s" : ""} will wrap past two rows` : "Caption length: fits two rows", fix: `Break into two captions: ${wide.slice(0, 4).map((l) => clock(l.startMs)).join(", ")}${wide.length > 4 ? "…" : ""}` });
    checks.push({ ok: flagged.length === 0, text: flagged.length ? `${flagged.length} line${flagged.length > 1 ? "s" : ""} flagged by the transcriber` : "No lines flagged for low confidence", fix: `Check these by ear: ${flagged.slice(0, 4).map((l) => clock(l.startMs)).join(", ")}${flagged.length > 4 ? "…" : ""}` });
  }

  const pinned = comments.filter((c) => c.at_ms != null);
  const general = comments.filter((c) => c.at_ms == null);
  const note = (c: RoomComment) => (
    <li key={c.id} className={c.resolved_at ? "done" : ""}>
      <button className="rr-note" onClick={() => c.at_ms != null && seek(c.at_ms)} disabled={c.at_ms == null}>
        <span className="mono">{c.at_ms != null ? clock(c.at_ms) : "General"}</span><b>{c.author}{c.kind === "approve" ? " · approved" : c.kind === "changes" ? " · asked for changes" : ""}</b><p>{c.body}</p>
      </button>
      <button className="link rr-resolve" onClick={() => onResolve(c.id, !c.resolved_at).catch((e) => setErr((e as Error).message))}>{c.resolved_at ? "Reopen" : "Mark done"}</button>
    </li>
  );

  return (
    <section className="review-room">
      <div className="rr-main">
        {src ? (
          <div className={"rr-player" + (audioOnly ? " audio" : "")}>
            <video ref={v} src={src} poster={poster ?? undefined} playsInline preload="metadata"
              onLoadedMetadata={(e) => { const el = e.currentTarget; setMeasured({ w: el.videoWidth, h: el.videoHeight, d: el.duration }); }}
              onTimeUpdate={(e) => setT(e.currentTarget.currentTime * 1000)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
            <button className="rr-big" aria-label={playing ? "Pause" : "Play"} onClick={() => (playing ? v.current?.pause() : v.current?.play())}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />}</button>
          </div>
        ) : (
          <p className="cr-empty">The light preview is still being made, so there is nothing to review yet.</p>
        )}
        <div className="rr-track" role="slider" aria-label="Timeline" aria-valuemin={0} aria-valuemax={Math.round(dur / 1000)} aria-valuenow={Math.round(t / 1000)} aria-valuetext={clock(t)} tabIndex={0}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); }}
          onKeyDown={(e) => { if (e.key === "ArrowRight") seek(Math.min(dur, t + 1000)); if (e.key === "ArrowLeft") seek(Math.max(0, t - 1000)); }}>
          <i style={{ width: `${Math.min(100, (t / dur) * 100)}%` }} />
          {pinned.map((n) => <b key={n.id} className={n.resolved_at ? "done" : ""} style={{ left: `${Math.min(100, ((n.at_ms ?? 0) / dur) * 100)}%` }} title={n.body} />)}
        </div>
        <div className="rr-meta mono"><span>{clock(t)} / {clock(dur)}</span><span>{facts.name}{facts.bytes ? ` · ${(facts.bytes / 1048576).toFixed(1)} MB` : ""}</span></div>
        <form className="rr-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <ChatCircleText />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add a note at ${clock(t)}`} aria-label={`Add a note at ${clock(t)}`} maxLength={2000} />
          <button className="btn" disabled={!draft.trim() || busy}>{busy ? "Pinning…" : "Pin note"}</button>
        </form>
        {err && <p className="cr-err" role="alert">{err}</p>}
        <p className="fine">You are reviewing the light preview, not the original file. Notes are saved to the project and shown to everyone on the team.</p>
      </div>
      <aside className="rr-side">
        <h3>Notes on the timeline</h3>
        {comments.length === 0 && <p className="fine">No notes yet. Pause where something is wrong and pin a note.</p>}
        <ol className="rr-notes">
          {pinned.map(note)}
          {general.map(note)}
        </ol>
        <h3>Automatic checks</h3>
        {checks.length === 0 && <p className="fine">Checks appear once the file has been read and there is a transcript.</p>}
        <ul className="rr-checks">
          {checks.map((c, i) => (
            <li key={i} className={c.ok ? "ok" : "bad"}>{c.ok ? <CheckCircle weight="fill" /> : <Warning weight="fill" />}<div><b>{c.text}</b>{!c.ok && <span>{c.fix}</span>}</div></li>
          ))}
        </ul>
        <div className="rr-judge">
          <span className="pill s-planned">Planned</span>
          <b>AI judge</b>
          <p>Scores the hook, pacing and clarity, and points to the exact second. It needs a model connected, so it shows nothing until one is.</p>
        </div>
      </aside>
    </section>
  );
}
