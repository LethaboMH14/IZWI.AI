import { CheckCircle, Clock, PencilSimple, Prohibit, Question, Sparkle, SpinnerGap, XCircle, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

export type Status =
  | "ready" | "queued" | "running" | "failed" | "held" | "draft" | "approved"
  | "requested" | "granted" | "declined" | "revoked" | "proposal" | "unknown";

const META: Record<Status, { word: string; icon: Icon; kind: string }> = {
  ready: { word: "Ready", icon: CheckCircle, kind: "moss" },
  approved: { word: "Approved", icon: CheckCircle, kind: "moss" },
  granted: { word: "Granted", icon: CheckCircle, kind: "moss" },
  queued: { word: "Queued", icon: Clock, kind: "amber" },
  running: { word: "Rendering", icon: SpinnerGap, kind: "amber" },
  failed: { word: "Failed", icon: XCircle, kind: "clay" },
  declined: { word: "Declined", icon: XCircle, kind: "clay" },
  revoked: { word: "Revoked", icon: XCircle, kind: "clay" },
  held: { word: "Held", icon: Prohibit, kind: "held" },
  draft: { word: "Draft", icon: PencilSimple, kind: "gold" },
  proposal: { word: "Proposal", icon: Sparkle, kind: "gold" },
  requested: { word: "Requested", icon: PaperPlaneTilt, kind: "outline" },
  unknown: { word: "Unknown", icon: Question, kind: "muted" },
};

export function StatusPill({ status, label, percent }: { status: Status; label?: string; percent?: number }) {
  const m = META[status];
  const Ic = m.icon;
  const pct = status === "running" && typeof percent === "number" && Number.isFinite(percent)
    ? ` ${Math.round(Math.min(100, Math.max(0, percent)))}%` : "";
  return (
    <span className={`z-pill z-pill-${m.kind}`} data-status={status}>
      <Ic size={12} weight="fill" aria-hidden="true" className={status === "running" ? "z-pill-spin" : undefined} />
      <span>{(label ?? m.word) + (label ? "" : pct)}</span>
    </span>
  );
}
