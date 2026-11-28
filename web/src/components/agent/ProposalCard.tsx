"use client";
import { useEffect, useMemo, useState } from "react";
import { Play } from "@phosphor-icons/react";
import { Button, StatusPill } from "@/components/z";
import { api, ApiError } from "@/lib/api";
import { trimEffects } from "@/lib/edit-effects";
import { currentLabel, type AgentProposal } from "@/lib/proposals";
import { trimBlocked } from "@/lib/timeline-math";
import { formatDuration, formatTime } from "@/lib/timecode";
import { usePlayheadStore, useProject, useProjectStore } from "@/components/workspace/ProjectProvider";
import { EffectsList } from "./EffectsList";
import { Wave } from "./Wave";

type Result = null | { kind: "applied" | "dismissed" | "already" | "stale" | "error"; message?: string };
const span = (r: { startMs: number; endMs: number }) => `${formatTime(r.startMs)} – ${formatTime(r.endMs)}`;

export function ProposalCard({ p, compact, localPending, setPending, announce, askAgain, canAsk }: {
  p: AgentProposal; compact: boolean; localPending: string[]; setPending: (clipId: string, on: boolean) => void;
  announce: (m: string) => void; askAgain: () => void; canAsk: boolean;
}) {
  const store = useProjectStore();
  const playhead = usePlayheadStore();
  const state = useProject((s) => s.state);
  const readOnly = useProject((s) => s.readOnly);
  const trackCache = useProject((s) => s.tracks);
  const [busy, setBusy] = useState<null | "approve" | "dismiss">(null);
  const [result, setResult] = useState<Result>(null);
  const trim = p.trim;

  const translationIds = useMemo(() => state.tracks.filter((t) => t.kind === "translation").map((t) => t.id).sort(), [state.tracks]);
  useEffect(() => { if (trim) for (const id of translationIds) void store.getState().loadTrack(id); }, [store, trim, translationIds]);

  const effects = useMemo(() => {
    if (!trim) return null;
    const tr: Record<string, { language: string; lines: { startMs: number; endMs: number }[] | null }> = {};
    for (const t of state.tracks) {
      if (t.kind !== "translation") continue;
      const c = trackCache[t.id];
      tr[t.id] = { language: t.language, lines: c?.status === "ready" ? (c.lines as { startMs: number; endMs: number }[]) : null };
    }
    return trimEffects(state, trim.clipId, trim.proposed, tr);
  }, [state, trim, trackCache]);

  const durationMs = state.proxy?.durationMs ?? state.source?.durationMs ?? 0;
  const block = trim ? trimBlocked({ outputs: state.outputs, readOnly: { value: readOnly.value, reason: readOnly.reason ?? undefined } }, trim.clipId, localPending)
    : readOnly.value ? (readOnly.reason ?? "This project is read-only.") : null;
  const changed = trim?.freshness === "changed" || result?.kind === "stale";
  const open = p.status === "proposed" && result?.kind !== "stale";

  const act = async (action: "approve" | "dismiss") => {
    if (busy) return;
    setBusy(action); setResult(null);
    if (trim) setPending(trim.clipId, true);
    try {
      const res = await store.getState().mutate(`plan:${p.planId}`, () => api<{ already?: boolean }>(`/api/plan/${p.planId}`, { method: "POST", body: { action } }));
      if (res && res.already) { setResult({ kind: "already" }); announce("Already decided"); }
      else { setResult({ kind: action === "approve" ? "applied" : "dismissed" }); announce(action === "approve" ? "Edit applied" : "Proposal dismissed"); }
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) { setResult({ kind: "stale", message: err.message }); announce("Changed since the suggestion"); }
      else { setResult({ kind: "error", message: err.message }); announce(`Failed: ${err.message}`); }
    } finally {
      setBusy(null);
      if (trim) setPending(trim.clipId, false);
    }
  };

  const status = result?.kind === "already" ? <StatusPill status="unknown" label="Already decided" />
    : p.status === "approved" ? <StatusPill status="approved" label="Applied" />
    : p.status === "dismissed" ? <StatusPill status="declined" label="Dismissed" />
    : p.status === "missing" ? <StatusPill status="unknown" label="No longer available" />
    : p.status === "proposed" ? <StatusPill status="proposal" />
    : <StatusPill status="unknown" label={p.status[0].toUpperCase() + p.status.slice(1)} />;

  return (
    <section className="ag-card" aria-label={p.title} data-status={p.status}>
      <header>
        <h3>{p.title}</h3>{status}
      </header>
      <p className="ag-reason">{p.reason}</p>
      {p.source && (
        <button type="button" className="ag-src" onClick={() => playhead.getState().seekTo(p.source!.atMs)}>
          From line {p.source.index} · <span className="mono">{formatTime(p.source.atMs)}</span>
        </button>
      )}

      {trim ? (
        <>
          <div className="ag-range">
            <div className="ag-fig" data-tone="original">
              <span>{currentLabel(trim.freshness)}</span>
              <strong>{trim.current ? formatDuration(trim.current.endMs - trim.current.startMs) : "--"}</strong>
              <span className="mono">{trim.current ? span(trim.current) : "Scene removed"}</span>
            </div>
            <span aria-hidden="true">→</span>
            <div className="ag-fig" data-tone="proposed">
              <span>Proposed</span>
              <strong>{formatDuration(trim.proposed.endMs - trim.proposed.startMs)}</strong>
              <span className="mono">{span(trim.proposed)}</span>
            </div>
          </div>
          {!compact && (
            <div className="ag-waves">
              <span>Current</span><Wave peaks={state.peaks} range={trim.current} durationMs={durationMs} tone="original" label="Recording envelope, current range" />
              <span>Proposed</span><Wave peaks={state.peaks} range={trim.proposed} durationMs={durationMs} tone="proposed" label="Recording envelope, proposed range" />
            </div>
          )}
        </>
      ) : p.preview.length > 0 && (
        <dl className="ag-diff">
          {p.preview.map((r, i) => (
            <div key={i}>
              <dt>{r.label}</dt>
              <dd>{r.before !== undefined && <del>{r.before}</del>}{r.before !== undefined && r.after !== undefined && <span aria-label="becomes"> → </span>}{r.after !== undefined && <ins>{r.after}</ins>}</dd>
            </div>
          ))}
        </dl>
      )}
      {p.scope && !trim && <p className="ag-scope">{p.scope}</p>}

      {changed && p.status === "proposed" && result?.kind !== "applied" && (
        <div className="ag-stale" role="status">
          <strong>Changed since the suggestion</strong>
          {canAsk && <Button size="sm" onClick={askAgain}>Ask again</Button>}
        </div>
      )}

      {open && (
        <div className="ag-actions">
          <Button variant="primary" loading={busy === "approve"} disabled={!!busy || !!block || changed} disabledReason={block ?? (changed ? "Changed since the suggestion" : undefined)} onClick={() => void act("approve")}>Apply edit</Button>
          <Button loading={busy === "dismiss"} disabled={!!busy} onClick={() => void act("dismiss")}>Dismiss</Button>
          {trim && <Button variant="ghost" className="ag-preview" disabled={!!busy} onClick={() => playhead.getState().playRange(trim.proposed.startMs, trim.proposed.endMs)}><Play size={14} weight="fill" aria-hidden="true" />Preview range</Button>}
        </div>
      )}
      {result?.kind === "error" && <p className="ag-err" role="alert">{result.message}</p>}
      {effects && open && !compact && <EffectsList effects={effects} />}
      {effects && open && compact && <p className="ag-detail">{effects.filter((e) => e.tone === "warn").length} to check in Effects</p>}
    </section>
  );
}
