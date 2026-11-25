"use client";
// Create: edit the transcript like text, shape clips on the real waveform, review with notes pinned to the timecode.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowUUpLeft, CaretLeft, CaretRight, CircleNotch, Pause, Pencil, Play, Plus, Scissors, Sparkle, Warning } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { clock, JOB_LABEL, media } from "@/lib/format";
import { Wave } from "@/components/Wave";
import { ReviewRoom } from "@/components/ReviewRoom";
import { StoryBoard } from "@/components/StoryBoard";
import { Uploader } from "@/components/Uploader";
import type { ProjectState, TabProps } from "./types";

type Clip = ProjectState["clips"][number];
type Line = ProjectState["lines"][number];
type W = { w: string; s: number; e: number; p?: number; g?: boolean };
type Drag = { id: string; start: number; end: number };
type Sub = "edit" | "review" | "story";

const SUBS: { id: Sub; label: string }[] = [{ id: "edit", label: "Edit" }, { id: "review", label: "Review room" }, { id: "story", label: "AI story" }];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
// Index of the last line that has started, or -1 when the playhead is well past it.
function lineAt(lines: Line[], t: number) {
  let lo = 0, hi = lines.length - 1, at = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (lines[m].startMs <= t) { at = m; lo = m + 1; } else hi = m - 1;
  }
  return at >= 0 && t > lines[at].endMs + 1500 ? -1 : at;
}
const secs = (ms: number) => `${Math.round(ms / 1000)} s`;

export function CreateTab({ state, refresh, target }: TabProps) {
  const [sub, setSub] = useState<Sub>(!state.source || target === "storyboard" ? "story" : "edit");
  return (
    <div className="cr">
      <div className="seg subseg" role="tablist" aria-label="Create">
        {SUBS.map((s) => <button key={s.id} role="tab" aria-selected={sub === s.id} className={sub === s.id ? "on" : ""} onClick={() => setSub(s.id)}>{s.label}</button>)}
      </div>
      <div className="subview" key={sub}>
        {sub === "edit" && (state.source ? <EditView state={state} refresh={refresh} /> : <AddRecording projectId={state.project.id} refresh={refresh} />)}
        {sub === "review" && (state.source ? <ReviewView state={state} refresh={refresh} /> : <p>Upload a recording to open the review room.</p>)}
        {sub === "story" && <StoryBoard projectId={state.project.id} script={state.project.script} refresh={refresh} />}
      </div>
    </div>
  );
}

function AddRecording({ projectId, refresh }: { projectId: string; refresh: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  return <div id="add-recording" tabIndex={-1} className="st-card">
    <h2>Add a recording</h2>
    {file ? <Uploader projectId={projectId} file={file} showNext onDone={() => void refresh()} />
      : <label className="field"><span>Choose video or audio</span><input type="file" accept="video/*,audio/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>}
  </div>;
}

/* ---------------------------------------------------------------- review room */

function ReviewView({ state, refresh }: { state: ProjectState; refresh: () => Promise<void> }) {
  const id = state.project.id;
  const src = state.source;
  return (
    <ReviewRoom
      src={state.proxy ? media(state.proxy.id) : null}
      poster={state.poster ? media(state.poster.id) : null}
      audioOnly={!src?.width}
      facts={{ name: src?.filename ?? null, bytes: src?.bytes ?? null, width: src?.width ?? null, height: src?.height ?? null, durationMs: src?.durationMs ?? null }}
      comments={state.comments}
      lines={state.lines.map((l) => ({ startMs: l.startMs, endMs: l.endMs, text: l.text, flag: l.flag }))}
      onAddComment={async (atMs, body) => { await api(`/api/projects/${id}/comments`, { body: { atMs, body } }); await refresh(); }}
      onResolve={async (cid, resolved) => { await api(`/api/items/comment/${cid}`, { method: "PATCH", body: { resolved } }); await refresh(); }}
    />
  );
}

/* ---------------------------------------------------------------- edit */

function EditView({ state, refresh }: { state: ProjectState; refresh: () => Promise<void> }) {
  const id = state.project.id;
  const { lines, clips, peaks } = state;
  const mediaRef = useRef<HTMLVideoElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stopAt = useRef<number | null>(null);
  const scrub = useRef(false);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mediaDur, setMediaDur] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [range, setRange] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
  const [anchor, setAnchor] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmListen, setConfirmListen] = useState(false);
  const [heard, setHeard] = useState("");
  const [term, setTerm] = useState("");
  const [fixMsg, setFixMsg] = useState<string | null>(null);
  const [teachOpen, setTeachOpen] = useState(false);

  const dur = state.source?.durationMs ?? state.proxy?.durationMs ?? (mediaDur || 0);
  const safeDur = Math.max(1, dur);
  const url = state.proxy ? media(state.proxy.id) : null;
  const audioOnly = !state.source?.width;
  const activeJob = (type: string) => state.jobs.find((j) => j.type === type && (j.status === "queued" || j.status === "running"));
  const transcribing = activeJob("transcribe");
  const finding = activeJob("suggest_clips");

  /* ---- playback ---- */
  const seek = useCallback((ms: number, play = false) => {
    const el = mediaRef.current;
    if (!el) return;
    const c = clamp(ms, 0, safeDur);
    el.currentTime = c / 1000;
    stopAt.current = null;
    setT(c);
    if (headRef.current) headRef.current.style.left = `${(c / safeDur) * 100}%`;
    if (play) el.play().catch(() => undefined);
  }, [safeDur]);
  const toggle = () => { const el = mediaRef.current; if (!el) return; if (el.paused) el.play().catch((e) => setErr(msg(e))); else el.pause(); };
  const playClip = (c: Clip) => {
    const el = mediaRef.current;
    if (!el) return;
    setActive(c.id);
    el.currentTime = c.startMs / 1000;
    setT(c.startMs);
    stopAt.current = c.endMs;
    el.play().catch((e) => setErr(msg(e)));
  };

  // Smooth playhead and "stop at the end of this clip" while playing; React state only updates a few times a second.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const el = mediaRef.current;
      if (!el) return;
      const ms = el.currentTime * 1000;
      if (headRef.current) headRef.current.style.left = `${(ms / safeDur) * 100}%`;
      if (stopAt.current != null && ms >= stopAt.current) { el.pause(); stopAt.current = null; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, safeDur]);

  const cur = lineAt(lines, t);
  useEffect(() => {
    if (!playing || cur < 0) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-idx="${cur}"]`);
    if (list && row) list.scrollTo({ top: row.offsetTop - list.clientHeight / 3, behavior: "smooth" });
  }, [cur, playing]);

  /* ---- actions ---- */
  const act = async (label: string, fn: () => Promise<void>) => {
    setErr(null); setWorking(label);
    try { await fn(); await refresh(); } catch (e) { setErr(msg(e)); } finally { setWorking(null); }
  };
  const run = (body: object, label: string) => act(label, async () => { await api(`/api/projects/${id}/run`, { body }); });
  const saveLine = useCallback(async (lineId: string, text: string) => { await api(`/api/items/line/${lineId}`, { method: "PATCH", body: { text } }); await refresh(); }, [refresh]);
  const setStatus = (c: Clip, status: "kept" | "dropped" | "suggested") => act(`status-${c.id}`, async () => { await api(`/api/items/clip/${c.id}`, { method: "PATCH", body: { status } }); });
  const rename = (c: Clip, title: string) => act(`title-${c.id}`, async () => { await api(`/api/items/clip/${c.id}`, { method: "PATCH", body: { title } }); });
  const commit = async (d: Drag) => {
    setErr(null);
    try { await api(`/api/items/clip/${d.id}`, { method: "PATCH", body: { startMs: Math.round(d.start), endMs: Math.round(d.end) } }); await refresh(); } catch (e) { setErr(msg(e)); }
    setDrag(null);
  };

  /* ---- waveform: scrub, drag edges ---- */
  const msAt = (clientX: number) => { const r = waveRef.current?.getBoundingClientRect(); return r && r.width ? clamp(((clientX - r.left) / r.width) * safeDur, 0, safeDur) : 0; };
  const edgeDown = (e: React.PointerEvent<HTMLElement>, c: Clip) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(c.id);
    setDrag({ id: c.id, start: c.startMs, end: c.endMs });
  };
  const edgeMove = (e: React.PointerEvent<HTMLElement>, c: Clip, which: "start" | "end") => {
    if (!drag || drag.id !== c.id || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const ms = msAt(e.clientX);
    const next = which === "start" ? { ...drag, start: clamp(ms, 0, drag.end - 1000) } : { ...drag, end: clamp(ms, drag.start + 1000, safeDur) };
    setDrag(next);
    seek(which === "start" ? next.start : next.end);
  };
  const edgeUp = (e: React.PointerEvent<HTMLElement>, c: Clip) => {
    if (!drag || drag.id !== c.id) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (Math.round(drag.start) === c.startMs && Math.round(drag.end) === c.endMs) { setDrag(null); return; }
    void commit(drag);
  };
  const edgeKey = (e: React.KeyboardEvent<HTMLElement>, c: Clip, which: "start" | "end") => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = (e.shiftKey ? 5000 : 500) * (e.key === "ArrowLeft" ? -1 : 1);
    const base = drag && drag.id === c.id ? drag : { id: c.id, start: c.startMs, end: c.endMs };
    const next = which === "start" ? { ...base, start: clamp(base.start + step, 0, base.end - 1000) } : { ...base, end: clamp(base.end + step, base.start + 1000, safeDur) };
    setDrag(next);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => void commit(next), 800);
  };
  useEffect(() => () => { if (nudgeTimer.current) clearTimeout(nudgeTimer.current); }, []);

  /* ---- new clip from a selection ---- */
  const markLine = useCallback((l: Line) => {
    if (anchor == null) { setRange({ start: l.startMs, end: l.endMs }); setAnchor(l.idx); return; }
    const from = Math.min(anchor, l.idx), to = Math.max(anchor, l.idx);
    const first = lines.find((x) => x.idx === from), last = lines.find((x) => x.idx === to);
    if (first && last) setRange({ start: first.startMs, end: last.endMs });
    setAnchor(null);
  }, [anchor, lines]);
  const hasRange = range.start != null && range.end != null && range.end > range.start;
  const makeClip = () => act("newclip", async () => {
    if (range.start == null || range.end == null) return;
    const inside = lines.filter((l) => l.endMs > range.start! && l.startMs < range.end!);
    const title = flat(inside[0]?.text ?? "").split(" ").slice(0, 7).join(" ") || "New clip";
    await api(`/api/projects/${id}/clips`, { body: { title: title.slice(0, 120), startMs: Math.round(range.start), endMs: Math.round(range.end) } });
    setRange({ start: null, end: null }); setAnchor(null);
  });

  /* ---- spelling ---- */
  const grabSelection = () => {
    const s = flat(window.getSelection()?.toString() ?? "");
    if (s && s.length <= 60) { setHeard(s); setFixMsg(null); setTeachOpen(true); }
  };
  const fix = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    void act("fix", async () => {
      const r = await api<{ fixed: number }>("/api/glossary", { body: { term: term.trim(), ...(heard.trim() ? { heard: heard.trim() } : {}) } });
      setFixMsg(heard.trim() ? (r.fixed ? `Fixed ${r.fixed} line${r.fixed === 1 ? "" : "s"} in the transcript. New recordings will spell it this way too.` : "Saved. No draft transcript line contained that wording. New recordings will spell it this way.") : "Saved. New recordings will spell it this way.");
      setHeard(""); setTerm("");
    });
  };

  /* ---- derived ---- */
  const shown = clips.filter((c) => c.status !== "dropped");
  const dropped = clips.filter((c) => c.status === "dropped");
  const edit = (c: Clip) => (drag && drag.id === c.id ? drag : { id: c.id, start: c.startMs, end: c.endMs });
  const regions = shown.map((c) => { const d = edit(c); return { start: d.start / safeDur, end: d.end / safeDur, active: c.id === active }; });

  return (
    <div className="cr-edit">
      <div className="cr-left">
      <div className="cr-stage">
        <div className="cr-dock">
        <div className={"cr-player" + (audioOnly ? " audio" : "")}>
          {url ? (
            <video ref={mediaRef} src={url} poster={state.poster ? media(state.poster.id) : undefined} playsInline preload="metadata" aria-label="Preview of the recording"
              onLoadedMetadata={(e) => setMediaDur(Math.round(e.currentTarget.duration * 1000))}
              onTimeUpdate={(e) => setT(e.currentTarget.currentTime * 1000)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
              onError={() => setErr("The preview could not be played in this browser.")} onClick={toggle} />
          ) : <p className="cr-empty">The light preview is still being made. The transcript and waveform work now; playback follows.</p>}
        </div>
        <div className="cr-transport">
          <button className="cr-icon" aria-label="Back 5 seconds" disabled={!url} onClick={() => seek(t - 5000)}><ArrowUUpLeft /></button>
          <button className="cr-play" aria-label={playing ? "Pause" : "Play"} disabled={!url} onClick={toggle}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />}</button>
          <button className="cr-icon" aria-label="Forward 5 seconds" disabled={!url} onClick={() => seek(t + 5000)}><ArrowClockwise /></button>
          <span className="mono cr-time">{clock(t)} / {clock(dur)}</span>
          <span className="cr-marks">
            <button className="btn btn-quiet" disabled={!url} onClick={() => { setRange((r) => ({ start: Math.round(t), end: r.end != null && r.end > t ? r.end : null })); setAnchor(null); }}>Set in</button>
            <button className="btn btn-quiet" disabled={!url} onClick={() => { setRange((r) => ({ start: r.start != null && r.start < t ? r.start : null, end: Math.round(t) })); setAnchor(null); }}>Set out</button>
          </span>
        </div>
        {peaks.length > 0 ? (
          <div className="cr-wave" ref={waveRef}
            onPointerDown={(e) => { if (!url) return; scrub.current = true; e.currentTarget.setPointerCapture(e.pointerId); seek(msAt(e.clientX)); }}
            onPointerMove={(e) => { if (scrub.current) seek(msAt(e.clientX)); }}
            onPointerUp={(e) => { scrub.current = false; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}>
            <Wave data={peaks} height={64} progress={t / safeDur} regions={regions} label="Waveform of the recording with your clips marked" />
            {hasRange && <div className="cr-range" style={{ left: `${(range.start! / safeDur) * 100}%`, width: `${((range.end! - range.start!) / safeDur) * 100}%` }} title="Selection for a new clip" />}
            {shown.map((c) => {
              const d = edit(c);
              return (
                <div key={c.id} className={"cr-region" + (c.id === active ? " on" : "") + (c.status === "suggested" ? " sug" : "")} style={{ left: `${(d.start / safeDur) * 100}%`, width: `${((d.end - d.start) / safeDur) * 100}%` }}>
                  <button className="cr-edge l" aria-label={`Start of ${c.title}, ${clock(d.start)}. Arrow keys move it.`} onPointerDown={(e) => edgeDown(e, c)} onPointerMove={(e) => edgeMove(e, c, "start")} onPointerUp={(e) => edgeUp(e, c)} onKeyDown={(e) => edgeKey(e, c, "start")}><CaretRight /></button>
                  <button className="cr-edge r" aria-label={`End of ${c.title}, ${clock(d.end)}. Arrow keys move it.`} onPointerDown={(e) => edgeDown(e, c)} onPointerMove={(e) => edgeMove(e, c, "end")} onPointerUp={(e) => edgeUp(e, c)} onKeyDown={(e) => edgeKey(e, c, "end")}><CaretLeft /></button>
                </div>
              );
            })}
            <div className="cr-head" ref={headRef} style={{ left: `${(t / safeDur) * 100}%` }} aria-hidden />
          </div>
        ) : <p className="cr-empty">The waveform is drawn while the preview is made. It will appear here.</p>}
        <details className="cr-how">
          <summary>How to trim</summary>
          <p className="fine">Click or drag on the waveform to move the playhead. Drag a clip&apos;s edges to trim it, or focus an edge and use the arrow keys (Shift for 5 seconds). Trimming a clip marks its finished renders as out of date.</p>
        </details>
        </div>
      </div>

      <section className="cr-clips" aria-label="Clips">
        <header>
          <h3>Clips</h3>
          <button className="btn btn-quiet" disabled={!!finding || !!working || lines.length === 0} onClick={() => void run({ type: "suggest_clips", count: 3 }, "suggest")} title={lines.length === 0 ? "There is no transcript to read yet." : undefined}>
            {finding ? <><CircleNotch className="spin" /> Finding clips…</> : <><Sparkle /> Find more clips</>}
          </button>
        </header>
        <div className={"cr-new" + (hasRange ? " ready" : "")}>
          <Scissors />
          <p>{range.start == null && range.end == null ? "Mark two transcript lines, or set an in and out point, to cut your own clip." : <><span className="mono">{range.start != null ? clock(range.start) : "set in"}</span> to <span className="mono">{range.end != null ? clock(range.end) : "set out"}</span>{hasRange && <> · {secs(range.end! - range.start!)}</>}</>}</p>
          <button className="btn" disabled={!hasRange || working === "newclip"} onClick={() => void makeClip()}><Plus /> New clip</button>
          {(range.start != null || range.end != null) && <button className="btn btn-quiet" onClick={() => { setRange({ start: null, end: null }); setAnchor(null); }}>Clear</button>}
        </div>
        {shown.length === 0 && <p className="cr-empty">{lines.length ? "No clips yet. Find clips, or cut your own from a selection." : "Clips appear after the recording has been listened to."}</p>}
        <ul className="cr-cliplist">
          {shown.map((c) => <li key={c.id} id={c.id} tabIndex={-1}><ClipCard clip={c} d={edit(c)} active={c.id === active} busy={working === `status-${c.id}` || working === `title-${c.id}`} onSelect={() => { setActive(c.id); seek(c.startMs); }} onPlay={() => playClip(c)} onStatus={(s) => void setStatus(c, s)} onRename={(title) => void rename(c, title)} /></li>)}
        </ul>
        {dropped.length > 0 && (
          <details className="cr-dropped">
            <summary>{dropped.length} dropped</summary>
            <ul>{dropped.map((c) => <li key={c.id}><span>{c.title}</span><span className="mono">{clock(c.startMs)}</span><button className="link" onClick={() => void setStatus(c, "suggested")}>Bring back</button></li>)}</ul>
          </details>
        )}
        {err && <p className="cr-err" role="alert"><Warning weight="fill" /> {err}</p>}
      </section>
      </div>

      <section className="cr-text" aria-label="Transcript">
        <header>
          <h3>Transcript</h3>
          {lines.length > 0 && !transcribing && (confirmListen ? (
            <span className="cr-confirm" role="alert">Replace the transcript and every translation?
              <button className="btn" onClick={() => { setConfirmListen(false); void run({ type: "transcribe" }, "listen"); }}>Yes, listen again</button>
              <button className="btn btn-quiet" onClick={() => setConfirmListen(false)}>Keep it</button>
            </span>
          ) : <button className="btn btn-quiet" onClick={() => setConfirmListen(true)}><ArrowClockwise /> Listen again</button>)}
        </header>
        <details className="cr-teach" open={teachOpen} onToggle={(e) => setTeachOpen(e.currentTarget.open)}>
          <summary>Teach spelling</summary>
          <form className="cr-fix" onSubmit={fix}>
            <label><span>Heard</span><input value={heard} onChange={(e) => setHeard(e.target.value)} maxLength={60} placeholder="Select it in the transcript" /></label>
            <label><span>Should be</span><input value={term} onChange={(e) => setTerm(e.target.value)} maxLength={60} placeholder="The right spelling" /></label>
            <button className="btn" disabled={!term.trim() || working === "fix"}>{heard.trim() ? "Fix everywhere" : "Save spelling"}</button>
            <p className="fine">Fixes every draft transcript line now and every new recording. Translations already made are not rewritten.</p>
          </form>
        </details>
        {fixMsg && <p className="fine cr-fixmsg" role="status">{fixMsg}</p>}
        {lines.length === 0 ? (
          <div className="cr-empty">
            {transcribing ? (
              <><CircleNotch className="spin" /> {JOB_LABEL.transcribe}{transcribing.stage ? `: ${transcribing.stage}` : ""} {Math.round(transcribing.progress * 100)}%</>
            ) : (
              <><p>No transcript yet.</p><button className="btn" disabled={!!working || !state.proxy} onClick={() => void run({ type: "transcribe" }, "listen")}>Listen to the recording</button>{!state.proxy && <p className="fine">Waiting for the light preview to finish first.</p>}</>
            )}
          </div>
        ) : (
          <div className="cr-lines" ref={listRef} onMouseUp={grabSelection} onTouchEnd={grabSelection}>
            {lines.map((l) => (
              <LineRow key={l.id} line={l} now={l.idx === lines[cur]?.idx} activeMs={l.idx === lines[cur]?.idx ? t : null}
                marked={hasRange && l.endMs > range.start! && l.startMs < range.end!} anchored={anchor === l.idx}
                onSeek={seek} onSave={saveLine} onMark={markLine} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- clip card */

function ClipCard({ clip, d, active, busy, onSelect, onPlay, onStatus, onRename }: {
  clip: Clip; d: Drag; active: boolean; busy: boolean;
  onSelect: () => void; onPlay: () => void; onStatus: (s: "kept" | "dropped") => void; onRename: (title: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const g = clip.gate;
  const names = g.waiting.map((w) => `${w.name} (${w.status})`).join(", ");
  const done = () => { const t = (draft ?? clip.title).trim(); setDraft(null); if (t && t !== clip.title) onRename(t); };
  return (
    <article className={"cr-clip" + (active ? " on" : "") + (clip.status === "kept" ? " kept" : "")}>
      <header>
        <button className="cr-clip-time mono" onClick={onSelect} title="Jump to the start">{clock(d.start)} to {clock(d.end)} · {secs(d.end - d.start)}</button>
        <span className={"pill " + (clip.status === "kept" ? "s-done" : "s-draft")}>{clip.status === "kept" ? "Kept" : "Suggested"}</span>
      </header>
      <input className="cr-clip-title" value={draft ?? clip.title} maxLength={120} aria-label="Clip title" onChange={(e) => setDraft(e.target.value)} onBlur={done}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); } }} />
      <p className="cr-why">{clip.reason}</p>
      <p className="fine">{clip.origin === "manual" ? "Chosen by you." : clip.origin === "model" ? "Suggested by a model you connected." : "Suggested by IZWI from the transcript. No model was used."}</p>
      <p className={"cr-gate " + (g.ok ? "ok" : "no")}>{g.ok ? "Declaration and consent recorded." : g.waiting.length ? `Held for consent: ${names}.` : "Held: your creator declaration is not recorded."}</p>
      <footer>
        <button className="btn btn-quiet" onClick={onPlay}><Play weight="fill" /> Play this clip</button>
        {clip.status !== "kept" && <button className="btn" disabled={busy} onClick={() => onStatus("kept")}>Keep</button>}
        <button className="btn btn-quiet" disabled={busy} onClick={() => onStatus("dropped")}>Drop</button>
      </footer>
    </article>
  );
}

/* ---------------------------------------------------------------- transcript line */

const LineRow = memo(function LineRow({ line, now, activeMs, marked, anchored, onSeek, onSave, onMark }: {
  line: Line; now: boolean; activeMs: number | null; marked: boolean; anchored: boolean;
  onSeek: (ms: number, play?: boolean) => void; onSave: (id: string, text: string) => Promise<void>; onMark: (l: Line) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const plain = flat(line.text);
  const words = line.words as unknown as W[];
  const exact = words.length > 0 && words.map((w) => w.w).join(" ") === plain;

  const start = () => { setText(plain); setErr(null); setEditing(true); };
  const save = async () => {
    const next = flat(text);
    if (!next || next === plain) { setEditing(false); return; }
    setBusy(true); setErr(null);
    try { await onSave(line.id, next); setEditing(false); } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  return (
    <div className={"cr-line" + (now ? " now" : "") + (marked ? " sel" : "") + (line.status === "approved" ? " ok" : "")} data-idx={line.idx}>
      <button className="cr-ts mono" onClick={() => onSeek(line.startMs, true)} aria-label={`Play from ${clock(line.startMs)}`}>{clock(line.startMs)}</button>
      <div className="cr-body">
        {editing ? (
          <>
            <textarea value={text} rows={2} maxLength={400} autoFocus aria-label={`Edit the line at ${clock(line.startMs)}`} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(); } if (e.key === "Escape") setEditing(false); }} />
            <div className="cr-edit-act">
              <button className="btn" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save line"}</button>
              <button className="btn btn-quiet" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
              <small>Editing re-spreads the word timing evenly across the line.</small>
            </div>
          </>
        ) : exact ? (
          <p className="cr-words" onClick={() => onSeek(line.startMs)}>
            {words.map((w, i) => {
              const on = activeMs != null && activeMs >= w.s && activeMs < w.e;
              const low = w.p !== undefined && w.p < 0.5;
              return (
                <span key={i} role="button" tabIndex={-1} className={"cr-w" + (w.g ? " g" : "") + (low ? " low" : "") + (on ? " on" : "")}
                  title={w.g ? "Spelled from your glossary" : low ? `Low confidence (${Math.round((w.p ?? 0) * 100)}%)` : undefined}
                  onClick={(e) => { e.stopPropagation(); onSeek(w.s, true); }}>{w.w} </span>
              );
            })}
          </p>
        ) : <p className="cr-words" onClick={() => onSeek(line.startMs)}>{plain}</p>}
        {err && <small className="cr-err">{err}</small>}
        {line.flag && !editing && <small className="cr-flag"><Warning weight="fill" /> {line.flag}</small>}
      </div>
      {!editing && (
        <div className="cr-lact">
          {line.edited && <span className="pill s-draft">edited</span>}
          <button className={"cr-icon" + (anchored ? " on" : "")} aria-label={anchored ? "Pick the last line of the clip" : "Mark this line for a new clip"} aria-pressed={anchored} title={anchored ? "Now mark the last line" : "Mark for a new clip"} onClick={() => onMark(line)}><Scissors /></button>
          <button className="cr-icon" aria-label="Edit this line" title="Edit" onClick={start}><Pencil /></button>
        </div>
      )}
    </div>
  );
});
