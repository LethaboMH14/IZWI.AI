import { useEffect, useRef, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import { api, ApiError, newKey } from "@/lib/api";
import type { ProjectStoreState } from "@/lib/project-store";

type RenderTarget = { id: string; title: string };
type PendingRender = {
  existingIds?: Set<string>;
  unknown?: { checks: number; deadline: number; timer: ReturnType<typeof setTimeout> };
};
const RECONCILIATION_MS = 20_000;

function isUnknownOutcome(error: unknown, signal: AbortSignal) {
  if (error instanceof ApiError) return [0, 408, 502, 503, 504].includes(error.status);
  return signal.aborted || error instanceof TypeError
    || (error instanceof Error && ["AbortError", "TimeoutError", "NetworkError"].includes(error.name));
}

export function useTimelineRenders(store: StoreApi<ProjectStoreState>) {
  const pendingRef = useRef(new Map<string, PendingRender>());
  const [pendingRenders, setPendingRenders] = useState<Set<string>>(() => new Set());
  const [unknownIds, setUnknownIds] = useState<Set<string>>(() => new Set());
  const [missingRenders, setMissingRenders] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [rendering, setRendering] = useState(false);
  const activeBatch = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const pending = pendingRef.current;
    // Only a newly applied server snapshot counts as a check. A failed GET keeps the lock.
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.state === previous.state || pending.size === 0) return;
      const missing: string[] = [];
      let changed = false;
      for (const [id, request] of pending) {
        const existingIds = request.existingIds;
        if (!existingIds) continue; // The batch has reserved this clip but has not sent its POST.
        const seen = state.state.outputs.some((output) => output.clipId === id && !existingIds.has(output.id));
        const check = request.unknown;
        const absent = !seen && check && (++check.checks >= 2 || Date.now() >= check.deadline);
        if (!seen && !absent) continue;
        if (check) clearTimeout(check.timer);
        pending.delete(id);
        changed = true;
        if (absent) {
          const title = state.state.clips.find((clip) => clip.id === id)?.title || id;
          missing.push(`No render was created · ${title}`);
        }
      }
      if (!changed) return;
      setPendingRenders(new Set(pending.keys()));
      setUnknownIds(new Set([...pending].filter(([, request]) => request.unknown).map(([id]) => id)));
      if (missing.length) setMissingRenders((previous) => [...previous, ...missing]);
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      for (const request of pending.values()) if (request.unknown) clearTimeout(request.unknown.timer);
      pending.clear();
    };
  }, [store]);

  const renderTargets = async (targets: RenderTarget[], preset: "vertical" | "square" | "wide") => {
    const { state, readOnly } = store.getState();
    const pending = pendingRef.current;
    if (activeBatch.current || readOnly.value || targets.some(({ id }) => pending.has(id))) return;
    activeBatch.current = true;
    setRendering(true);
    setSummary("");
    setMissingRenders([]);
    for (const { id } of targets) pending.set(id, {});
    setPendingRenders(new Set(pending.keys()));

    let queued = 0;
    const failures: string[] = [];
    try {
      for (const { id } of targets) {
        const request = pending.get(id);
        if (request) {
          const outputs = store.getState().state.outputs;
          request.existingIds = new Set(outputs.filter((output) => output.clipId === id).map((output) => output.id));
        }
        const signal = AbortSignal.timeout(15_000);
        try {
          await api(`/api/projects/${encodeURIComponent(state.project.id)}/outputs`, {
            body: { clipId: id, preset, language: null, burn: true }, key: newKey(), signal,
          });
          queued++;
        } catch (error) {
          if (!mounted.current) continue;
          if (isUnknownOutcome(error, signal)) {
            const waiting = pending.get(id);
            if (!waiting) continue; // A poll already found the output.
            waiting.unknown = {
              checks: 0,
              deadline: Date.now() + RECONCILIATION_MS,
              timer: setTimeout(() => { void store.getState().refresh(); }, RECONCILIATION_MS),
            };
            setUnknownIds((previous) => new Set([...previous, id]));
            void store.getState().refresh();
          } else {
            failures.push(error instanceof Error ? error.message : "request failed");
            pending.delete(id);
            setPendingRenders(new Set(pending.keys()));
          }
        }
      }
      if (!mounted.current) return;
      const success = queued ? `${queued} of ${targets.length} queued` : "";
      const failure = failures.length ? `${failures.length} failed: ${failures[0]}` : "";
      setSummary([success, failure].filter(Boolean).join(" · "));
      if (queued) await store.getState().refresh();
    } finally {
      activeBatch.current = false;
      if (mounted.current) setRendering(false);
    }
  };

  const renderNotice = [unknownIds.size ? "Outcome unknown · refreshing" : "", ...missingRenders, summary].filter(Boolean).join(" · ");
  return { rendering, pendingRenders, pendingRef, renderNotice, renderTargets };
}
