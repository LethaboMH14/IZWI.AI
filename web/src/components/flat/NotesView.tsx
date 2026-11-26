"use client";
// The Notes tab: comments pinned to a time, and a box to add one at the playhead.
import { useState, type FormEvent } from "react";
import { Notepad } from "@phosphor-icons/react";
import { Button, EmptyState, StatusPill, Timecode } from "@/components/z";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/timecode";
import { usePlayhead, usePlayheadStore, useProject, useProjectStore } from "@/components/workspace/ProjectProvider";
import { useReadOnlyReason } from "./hooks";
import { messageOf } from "./jobs";

/** Notes still open: the count on the tab. */
export function useOpenNotes(): number {
  return useProject((s) => s.state.comments.filter((c) => !c.resolved_at).length);
}

function Composer() {
  const store = useProjectStore();
  const ms = usePlayhead((s) => s.ms);
  const readOnly = useReadOnlyReason();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true); setError(null);
    const atMs = Math.round(ms);
    try {
      await store.getState().mutate("comment", (signal) => api(`/api/projects/${store.getState().id}/comments`, { body: { atMs, body: text }, signal }));
      setBody("");
    } catch (cause) {
      setError(messageOf(cause, "Note not saved."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="fs-notebox" onSubmit={submit}>
      <label>
        <span>Note at <Timecode ms={ms} /></span>
        <textarea value={body} rows={2} maxLength={2000} onChange={(e) => setBody(e.target.value)} disabled={!!readOnly}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
      </label>
      <div className="fs-teach-act">
        <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!!readOnly || !body.trim()} disabledReason={readOnly ?? (body.trim() ? undefined : "Write a note first")}>Add note</Button>
        {error && <span className="fs-error" role="alert">{error}</span>}
      </div>
    </form>
  );
}

export function NotesView() {
  const comments = useProject((s) => s.state.comments);
  const ph = usePlayheadStore();
  return (
    <div className="fs-nview">
      <Composer />
      {comments.length === 0 ? (
        <EmptyState icon={<Notepad size={28} />} title="No notes yet" line="Notes sit at a time in the recording" />
      ) : (
        <ul className="fs-notes">
          {comments.map((c) => (
            <li key={c.id} className="fs-note" data-resolved={c.resolved_at ? "true" : undefined}>
              <div className="fs-note-head">
                {c.at_ms != null
                  ? <button type="button" className="fs-tc fs-mono" aria-label={`Play from ${formatTime(c.at_ms)}`} onClick={() => ph.getState().seekTo(c.at_ms ?? 0)}>{formatTime(c.at_ms)}</button>
                  : <span className="fs-muted">Whole recording</span>}
                <span className="fs-muted">{c.author}</span>
                {c.kind === "approve" && <StatusPill status="approved" />}
                {c.kind === "changes" && <StatusPill status="requested" label="Changes requested" />}
                {c.resolved_at ? <span className="fs-tag">Resolved</span> : null}
              </div>
              <p className="fs-note-body">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
