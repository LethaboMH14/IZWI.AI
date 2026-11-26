"use client";
// The Transcript tab: the main editing surface. One row per source line (TranscriptRow in the design system).
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DotsThree, MagnifyingGlass, PencilSimple, Warning } from "@phosphor-icons/react";
import { Button, ContextMenu, DropdownMenu, EmptyState, IconButton, Kbd, Tooltip, type MenuItem } from "@/components/z";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/timecode";
import { filterLines, lineIndexAt, rangeFromLine, rangeFromLineIndexes, splitByQuery, wordIndexAt, type Line, type Word } from "@/lib/scenes";
import { usePlayhead, usePlayheadStore, useProject, useProjectStore } from "@/components/workspace/ProjectProvider";
import { useDurationMs, useFlat } from "./flat-context";
import { useReadOnlyReason } from "./hooks";
import { isActive, isFailed, latestJob, messageOf, percentOf, retryJob, runStep } from "./jobs";

const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const AUTOSCROLL_PAUSE_MS = 4000;

type RowProps = {
  line: Line;
  current: boolean;
  query: string;
  readOnly: string | undefined;
  onSeek: (ms: number) => void;
  onMake: (line: Line) => void;
  onTeach: (heard: string) => void;
};

const Row = memo(function Row({ line, current, query, readOnly, onSeek, onMake, onTeach }: RowProps) {
  const store = useProjectStore();
  const words = line.words as unknown as Word[];
  // The spoken word is highlighted only on lines nobody edited: editing spreads the word times evenly.
  const wordIndex = usePlayhead((s) => (current && !query && !line.edited && words.length ? wordIndexAt(words, s.ms) : -1));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const settle = () => { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); };
  // The text this edit started from: sent as expectText so an edit made elsewhere meanwhile is refused, not overwritten.
  const baseText = useRef<string | null>(null);
  const start = () => { baseText.current = line.text; setDraft(flat(line.text)); setError(null); setStatus("idle"); setEditing(true); };
  const save = async () => {
    const next = flat(draft);
    if (!next || next === flat(line.text)) { settle(); return; }
    setStatus("saving"); setError(null);
    try {
      await store.getState().mutate(`line:${line.id}`, (signal) => api(`/api/items/line/${encodeURIComponent(line.id)}`, { method: "PATCH", body: { text: next, expectText: baseText.current ?? line.text }, signal }));
      setStatus("saved");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus("idle"), 2500);
      settle();
    } catch (cause) {
      setStatus("error");
      setError(messageOf(cause, "Line not saved."));
    }
  };

  const stamp = formatTime(line.startMs);
  const items: MenuItem[] = [
    { heading: `Line ${line.idx + 1} · ${stamp}` },
    { id: "scene", label: "Make a scene from this line", disabled: !!readOnly, disabledReason: readOnly, onSelect: () => onMake(line) },
    { id: "tc", label: "Copy timecode", onSelect: () => void navigator.clipboard?.writeText(stamp).catch(() => undefined) },
    { separator: true },
    { id: "teach", label: "Teach spelling…", disabled: !!readOnly, disabledReason: readOnly, onSelect: () => onTeach(flat(window.getSelection()?.toString() ?? "").slice(0, 60)) },
  ];

  const text = line.text;
  let body: React.ReactNode;
  if (query) body = splitByQuery(text, query).map((p, i) => (p.hit ? <mark key={i} className="fs-hit">{p.text}</mark> : p.text));
  else if (!line.edited && words.length && words.map((w) => w.w).join(" ") === flat(text)) {
    body = words.map((w, i) => <span key={i} className={i === wordIndex ? "is-word" : undefined}>{w.w}{i < words.length - 1 ? " " : ""}</span>);
  } else body = text;

  return (
    <ContextMenu items={items}>
      <div role="listitem" className="fs-line" data-idx={line.idx} data-editing={editing || undefined} aria-current={current ? "true" : undefined}>
        <button type="button" className="fs-tc fs-mono" aria-label={`Play from ${stamp}`} onClick={() => onSeek(line.startMs)}>{stamp}</button>
        <div className="fs-line-body" onClick={() => { if (!editing && !window.getSelection()?.toString()) onSeek(line.startMs); }}>
          {editing ? (
            <>
              <textarea
                className="fs-line-edit" value={draft} rows={2} maxLength={400} autoFocus aria-label={`Edit the line at ${stamp}`} disabled={status === "saving"}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(); }
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setError(null); setStatus("idle"); settle(); }
                }}
              />
              <span className="fs-line-hint">Enter saves · Esc cancels</span>
            </>
          ) : <p className="fs-line-text">{body}</p>}
          <span className="fs-line-meta" aria-live="polite">
            {line.edited && <span className="fs-tag">Edited</span>}
            {line.flag && (
              <Tooltip content={line.flag}>
                <span className="fs-tag fs-tag-clay" tabIndex={0}><Warning size={12} weight="fill" aria-hidden="true" />Check</span>
              </Tooltip>
            )}
            {status === "saving" && <span className="fs-saving">Saving…</span>}
            {status === "saved" && <span className="fs-saved">Saved</span>}
            {status === "error" && error && <span className="fs-error" role="alert">{error}</span>}
          </span>
        </div>
        {!editing && (
          <div className="fs-line-act">
            <IconButton ref={editButton} size="sm" label="Edit line" icon={<PencilSimple size={16} />} disabled={!!readOnly} disabledReason={readOnly} onClick={start} />
            <DropdownMenu align="end" items={items} trigger={<IconButton size="sm" label="Line actions" icon={<DotsThree size={18} weight="bold" />} />} />
          </div>
        )}
      </div>
    </ContextMenu>
  );
});

function Busy({ title, percent, stage }: { title: string; percent: number | null; stage?: string | null }) {
  return (
    <div className="fs-panel fs-panel-flow" role="status">
      <strong>{title}</strong>
      {percent != null
        ? <span className="fs-bar" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></span>
        : <span className="fs-muted">Queued</span>}
      {percent != null && <span className="fs-muted fs-mono">{percent}%{stage ? ` · ${stage}` : ""}</span>}
    </div>
  );
}

export function TranscriptView() {
  const store = useProjectStore();
  const ph = usePlayheadStore();
  const lines = useProject((s) => s.state.lines);
  const source = useProject((s) => s.state.source);
  const job = useProject((s) => latestJob(s.state.jobs, ["transcribe"]));
  const readOnly = useReadOnlyReason();
  const durationMs = useDurationMs();
  const { createScene } = useFlat();

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ from: number; to: number; text: string } | null>(null);
  const [teach, setTeach] = useState<{ heard: string } | null>(null);
  const [term, setTerm] = useState("");
  const [heard, setHeard] = useState("");
  const [teachMsg, setTeachMsg] = useState<string | null>(null);
  const [teachBusy, setTeachBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const userScrolledAt = useRef(0);
  const selectionRef = useRef(selection);
  useEffect(() => { selectionRef.current = selection; }, [selection]);

  const current = usePlayhead((s) => lineIndexAt(lines, s.ms, 800));
  const shown = useMemo(() => filterLines(lines, query), [lines, query]);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Keep the current line in view, unless the user scrolled in the last few seconds.
  useEffect(() => {
    if (current < 0 || Date.now() - userScrolledAt.current < AUTOSCROLL_PAUSE_MS) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !row) return;
    const top = row.offsetTop, bottom = top + row.offsetHeight;
    if (top >= list.scrollTop && bottom <= list.scrollTop + list.clientHeight) return;
    list.scrollTo({ top: Math.max(0, top - list.clientHeight / 3), behavior: reduced ? "auto" : "smooth" });
  }, [current, reduced]);

  // Ctrl or Cmd K goes to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Track which lines the browser's text selection covers.
  useEffect(() => {
    const onChange = () => {
      const sel = window.getSelection();
      const list = listRef.current;
      if (!sel || !list || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) { setSelection(null); return; }
      const rowOf = (n: Node) => (n instanceof Element ? n : n.parentElement)?.closest<HTMLElement>("[data-idx]") ?? null;
      const a = rowOf(sel.anchorNode), b = rowOf(sel.focusNode);
      if (!a || !b || !list.contains(a) || !list.contains(b)) { setSelection(null); return; }
      const [x, y] = [Number(a.dataset.idx), Number(b.dataset.idx)];
      setSelection({ from: Math.min(x, y), to: Math.max(x, y), text: flat(sel.toString()).slice(0, 60) });
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  const onSeek = useCallback((ms: number) => ph.getState().seekTo(ms), [ph]);
  const onMake = useCallback((line: Line) => {
    const range = rangeFromLine(line, durationMs);
    if (range) void createScene(range);
  }, [createScene, durationMs]);
  const onTeach = useCallback((text: string) => {
    setHeard(text || selectionRef.current?.text || "");
    setTerm("");
    setTeachMsg(null);
    setTeach({ heard: text });
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setActionError(null);
    try { await fn(); } catch (cause) { setActionError(messageOf(cause)); } finally { setBusy(false); }
  };

  // States before there is a transcript to edit.
  if (lines.length === 0) {
    if (isActive(job)) return <Busy title="Transcribing" percent={percentOf(job)} stage={job?.stage} />;
    if (!source) return <EmptyState icon={<MagnifyingGlass size={28} />} title="No recording yet" line="The words appear here" />;
    if (isFailed(job)) {
      return (
        <div className="fs-panel fs-panel-flow" role="alert">
          <strong>Transcription failed</strong>
          {job?.error && <span className="fs-muted">{job.error}</span>}
          {actionError && <span className="fs-error">{actionError}</span>}
          <Button size="sm" loading={busy} disabled={!!readOnly} disabledReason={readOnly} onClick={() => job && void act(() => retryJob(store, job.id))}>Retry</Button>
        </div>
      );
    }
    return (
      <EmptyState icon={<MagnifyingGlass size={28} />} title="No transcript yet" line="The recording's words appear here"
        action={<><Button variant="primary" loading={busy} disabled={!!readOnly} disabledReason={readOnly} onClick={() => void act(() => runStep(store, { type: "transcribe" }))}>Transcribe</Button>{actionError && <span className="fs-error" role="alert">{actionError}</span>}</>} />
    );
  }

  const submitTeach = (e: FormEvent) => {
    e.preventDefault();
    const t = term.trim();
    if (!t) return;
    setTeachBusy(true); setTeachMsg(null);
    store.getState().mutate("project", (signal) => api<{ fixed?: number }>("/api/glossary", { body: { term: t, ...(heard.trim() ? { heard: heard.trim() } : {}) }, signal }))
      .then((r) => { setTeachMsg(heard.trim() ? (r?.fixed ? `Fixed ${r.fixed} ${r.fixed === 1 ? "line" : "lines"}` : "Saved · No lines changed") : "Saved"); setTerm(""); setHeard(""); })
      .catch((cause: unknown) => setTeachMsg(messageOf(cause, "Spelling not saved.")))
      .finally(() => setTeachBusy(false));
  };
  const sceneRange = selection ? rangeFromLineIndexes(lines, Array.from({ length: selection.to - selection.from + 1 }, (_, i) => selection.from + i), durationMs) : null;
  const sceneReason = readOnly ?? (sceneRange ? undefined : "Select lines in the transcript");

  return (
    <div className="fs-tview">
      <label className="fs-search">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <input
          ref={searchRef} aria-label="Search transcript" placeholder="Search transcript" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && query) { e.stopPropagation(); setQuery(""); } }}
        />
        {query ? <span className="fs-mono fs-muted">{shown.length}/{lines.length}</span> : <Kbd>Ctrl K</Kbd>}
      </label>
      <div
        ref={listRef} className="fs-lines" role="list" aria-label="Transcript lines"
        onWheel={() => { userScrolledAt.current = Date.now(); }} onTouchMove={() => { userScrolledAt.current = Date.now(); }}
        onPointerDown={() => { userScrolledAt.current = Date.now(); }} onKeyDown={() => { userScrolledAt.current = Date.now(); }}
      >
        {shown.map((line) => (
          <Row key={line.id} line={line} current={line.idx === lines[current]?.idx && current >= 0} query={query} readOnly={readOnly} onSeek={onSeek} onMake={onMake} onTeach={onTeach} />
        ))}
        {shown.length === 0 && <p className="fs-none" role="status">No matches</p>}
      </div>
      {teach && (
        <form className="fs-teach" onSubmit={submitTeach} aria-label="Teach spelling">
          <label>Spelling<input value={term} onChange={(e) => setTerm(e.target.value)} maxLength={60} required autoFocus /></label>
          <label>Heard as<input value={heard} onChange={(e) => setHeard(e.target.value)} maxLength={60} placeholder="Optional" /></label>
          <div className="fs-teach-act">
            <Button type="submit" variant="primary" size="sm" loading={teachBusy}>Save spelling</Button>
            <Button size="sm" variant="ghost" onClick={() => { setTeach(null); setTeachMsg(null); }}>Close</Button>
            {teachMsg && <span className="fs-muted" role="status">{teachMsg}</span>}
          </div>
        </form>
      )}
      <div className="fs-tfoot">
        <Button size="sm" loading={false} disabled={!!sceneReason} disabledReason={sceneReason} onClick={() => sceneRange && void createScene(sceneRange)}>Add scene from selection</Button>
        <Button size="sm" variant="ghost" disabled={!!readOnly} disabledReason={readOnly} onClick={() => onTeach(selection?.text ?? "")}>Teach spelling</Button>
      </div>
    </div>
  );
}
