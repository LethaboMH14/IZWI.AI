// Assistant proposals as the agent panel shows them. Numbers come from the plan's typed steps, never from the
// display strings in `preview` (Codex review, round 1 finding 4). Freshness is only claimed when it is known.
import type { ProjectState } from "@/server/state";

export type Range = { startMs: number; endMs: number };
export type Freshness = "fresh" | "changed" | "unknown";
export type ThreadProposal = {
  planId: string;
  title: string;
  reason: string;
  source?: { lineId: string; index: number; atMs: number };
  preview: { label: string; before?: string; after?: string }[];
  scope?: string;
  kind: "action" | "jobs";
  status?: string;
};
export type AgentProposal = ThreadProposal & {
  status: string;
  /** Present only for a single trimClip step whose numbers we can read. */
  trim: null | { clipId: string; clipTitle: string | null; current: Range | null; proposed: Range; freshness: Freshness };
};

type Plan = ProjectState["plans"][number];
type Clip = ProjectState["clips"][number];
type TrimStep = { kind: "action"; action: "trimClip"; args: { clipId: string; startMs: number; endMs: number }; pre?: { clips?: { id: string; updatedAt?: number }[] } };

function isTrimStep(s: unknown): s is TrimStep {
  if (!s || typeof s !== "object") return false;
  const x = s as Record<string, unknown>;
  const a = x.args as Record<string, unknown> | undefined;
  return x.kind === "action" && x.action === "trimClip" && !!a && typeof a.clipId === "string" && Number.isInteger(a.startMs) && Number.isInteger(a.endMs) && (a.endMs as number) > (a.startMs as number);
}

/** "fresh" only when the step's precondition timestamp equals the clip's current one (needs clips[].updatedAt). */
export function freshnessOf(step: TrimStep, clip: Clip | undefined): Freshness {
  if (!clip) return "changed";
  const pre = step.pre?.clips?.find((c) => c.id === step.args.clipId)?.updatedAt;
  const now = (clip as Clip & { updatedAt?: number }).updatedAt;
  if (typeof pre !== "number" || typeof now !== "number") return "unknown";
  return pre === now ? "fresh" : "changed";
}

export function trimOf(plan: Plan | undefined, state: ProjectState): AgentProposal["trim"] {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length !== 1) return null;
  const step = plan.steps[0] as unknown;
  if (!isTrimStep(step)) return null;
  const clip = state.clips.find((c) => c.id === step.args.clipId);
  return {
    clipId: step.args.clipId,
    clipTitle: clip?.title ?? null,
    current: clip ? { startMs: clip.startMs, endMs: clip.endMs } : null,
    proposed: { startMs: step.args.startMs, endMs: step.args.endMs },
    freshness: freshnessOf(step, clip),
  };
}

/** Proposals from the thread, newest first, with the plan's live status winning over the thread's copy. */
export function agentProposals(thread: ThreadProposal[], state: ProjectState): AgentProposal[] {
  const plans = new Map(state.plans.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: AgentProposal[] = [];
  for (const p of [...thread].reverse()) {
    if (seen.has(p.planId)) continue;
    seen.add(p.planId);
    const plan = plans.get(p.planId);
    out.push({ ...p, status: plan?.status ?? p.status ?? "proposed", trim: trimOf(plan, state) });
  }
  return out;
}

/** The label above the left figure: "Original" only when we know the clip has not changed since the suggestion. */
export const currentLabel = (f: Freshness) => (f === "fresh" ? "Original" : "Current range");
