"use client";
// "No scenes yet" with the one action that fills it; shows the real job while it runs and Retry if it failed.
import { useState } from "react";
import { MagicWand } from "@phosphor-icons/react";
import { Button } from "@/components/z";
import { useProject, useProjectStore } from "@/components/workspace/ProjectProvider";
import { isActive, isFailed, latestJob, messageOf, percentOf, retryJob, runStep } from "./jobs";
import { useReadOnlyReason } from "./hooks";

export function FindHighlights() {
  const store = useProjectStore();
  const hasLines = useProject((s) => s.state.lines.length > 0);
  const job = useProject((s) => latestJob(s.state.jobs, ["suggest_clips"]));
  const readOnly = useReadOnlyReason();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  };
  const running = isActive(job);
  const pct = percentOf(job);
  const failed = isFailed(job);
  return (
    <div className="fs-nolist" role="status">
      <strong>No scenes yet</strong>
      {running ? <span className="fs-muted">Finding highlights{pct != null ? ` ${pct}%` : ""}</span>
        : failed ? <Button size="sm" loading={busy} disabled={!!readOnly} disabledReason={readOnly} onClick={() => job && void act(() => retryJob(store, job.id))}>Retry</Button>
        : <Button size="sm" loading={busy} disabled={!hasLines || !!readOnly} disabledReason={readOnly ?? (hasLines ? undefined : "Transcribe first")}
            onClick={() => void act(() => runStep(store, { type: "suggest_clips", count: 3 }))}><MagicWand size={14} aria-hidden="true" />Find highlights</Button>}
      {failed && !running && <span className="fs-error">Highlights failed</span>}
      {error && <span className="fs-error" role="alert">{error}</span>}
    </div>
  );
}
