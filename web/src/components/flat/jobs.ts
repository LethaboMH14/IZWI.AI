import type { StoreApi } from "zustand/vanilla";
import type { ProjectState } from "@/server/state";
import type { ProjectStoreState } from "@/lib/project-store";
import { api } from "@/lib/api";

export type Job = ProjectState["jobs"][number];

/** The newest job of any of these types (the server lists jobs newest first). */
export function latestJob(jobs: readonly Job[], types: readonly string[]): Job | null {
  return jobs.find((j) => types.includes(j.type)) ?? null;
}

export const isActive = (job: Job | null | undefined) => job?.status === "queued" || job?.status === "running";
export const isFailed = (job: Job | null | undefined) => job?.status === "failed" || job?.status === "blocked";

/** Whole percent of a running job, or null while it is only queued. */
export function percentOf(job: Job | null | undefined): number | null {
  if (!job || job.status !== "running" || !Number.isFinite(job.progress)) return null;
  return Math.round(Math.min(1, Math.max(0, job.progress)) * 100);
}

/** One explicit retry per click; never automatic. */
export function retryJob(store: StoreApi<ProjectStoreState>, jobId: string) {
  return store.getState().mutate("project", (signal) => api(`/api/items/job/${encodeURIComponent(jobId)}`, { method: "PATCH", body: { action: "retry" }, signal }));
}

export function runStep(store: StoreApi<ProjectStoreState>, body: { type: "transcribe" } | { type: "suggest_clips"; count: number }) {
  const s = store.getState();
  return s.mutate("project", (signal) => api(`/api/projects/${s.id}/run`, { body, signal }));
}

export const messageOf = (cause: unknown, fallback = "Something went wrong. Try again.") => (cause instanceof Error ? cause.message : fallback);
