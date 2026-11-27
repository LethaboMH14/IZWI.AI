"use client";
// The Captions tab: one row per caption track with its review count. Review itself lives in Localise.
import { useState } from "react";
import Link from "next/link";
import { ClosedCaptioning } from "@phosphor-icons/react";
import { Button, EmptyState, StatusPill, type Status } from "@/components/z";
import { api } from "@/lib/api";
import { langName } from "@/lib/languages";
import { useProject, useProjectStore } from "@/components/workspace/ProjectProvider";
import { useReadOnlyReason } from "./hooks";
import { messageOf } from "./jobs";

const TRACK: Record<string, { status: Status; label?: string }> = {
  draft: { status: "draft" },
  in_review: { status: "draft", label: "In review" },
  approved: { status: "approved" },
  revision_requested: { status: "requested", label: "Changes requested" },
};

export function CaptionsView() {
  const store = useProjectStore();
  const id = useProject((s) => s.id);
  const tracks = useProject((s) => s.state.tracks);
  const readOnly = useReadOnlyReason();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  const approveAll = async (trackId: string) => {
    setBusyId(trackId); setError(null);
    try {
      await store.getState().mutate(`track:${trackId}`, (signal) => api(`/api/items/track/${encodeURIComponent(trackId)}`, { method: "PATCH", body: { approveAll: true }, signal }));
      store.getState().invalidateTrack(trackId);
    } catch (cause) {
      setError({ id: trackId, message: messageOf(cause, "Not approved.") });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fs-cview">
      {tracks.length === 0 ? (
        <EmptyState icon={<ClosedCaptioning size={28} />} title="No captions yet" line="Tracks appear here once there is a transcript" />
      ) : (
        <ul className="fs-tracks">
          {tracks.map((t) => {
            const source = t.kind === "source";
            const meta = TRACK[t.status] ?? { status: "unknown" as Status, label: t.status };
            const open = t.lines - t.approved;
            const reason = readOnly ?? (open === 0 ? "Every line is approved" : undefined);
            return (
              <li key={t.id} className="fs-track">
                <div className="fs-track-main">
                  <span className="fs-track-name">{langName(t.language)}<span className="fs-muted"> · {source ? "source" : "translation"}</span></span>
                  <span className="fs-track-meta">
                    <StatusPill status={meta.status} label={meta.label} />
                    <span className="fs-mono" title="Approved lines of all lines">{t.approved}/{t.lines}</span>
                    {t.flagged > 0 && <span className="fs-tag fs-tag-clay">{t.flagged} to check</span>}
                  </span>
                </div>
                {!source && (
                  <Button size="sm" loading={busyId === t.id} disabled={!!reason} disabledReason={reason} onClick={() => void approveAll(t.id)}>Approve all</Button>
                )}
                {error?.id === t.id && <span className="fs-error" role="alert">{error.message}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <Link className="fs-link" href={`/app/p/${id}/localise`}>Open Localise</Link>
    </div>
  );
}
