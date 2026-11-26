"use client";
// State the Flat Studio panels share and the store does not hold: the In and Out marks, and making a scene.
// Writes go through the project store's write queue, never retried automatically.
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/lib/api";
import { lineIndexAt, rangeFromLine, rangeFromMarks, titleFromLines, type SceneRange } from "@/lib/scenes";
import { usePlayhead, usePlayheadStore, useProject, useProjectStore } from "@/components/workspace/ProjectProvider";

type FlatCtx = {
  inMs: number | null;
  outMs: number | null;
  setIn(): void;
  setOut(): void;
  clearMarks(): void;
  /** Create a scene from a range; resolves true when it was saved. */
  createScene(range: SceneRange): Promise<boolean>;
  /** The range the In and Out marks describe, or null. */
  markRange: SceneRange | null;
  creating: boolean;
  error: string | null;
  clearError(): void;
};
const Ctx = createContext<FlatCtx | null>(null);

export function useFlat(): FlatCtx {
  const value = useContext(Ctx);
  if (!value) throw new Error("Flat Studio hooks must be used inside <FlatProvider>.");
  return value;
}

export function useDurationMs(): number {
  return useProject((s) => s.state.proxy?.durationMs ?? s.state.source?.durationMs ?? 0);
}

export function FlatProvider({ children }: { children: ReactNode }) {
  const store = useProjectStore();
  const playhead = usePlayheadStore();
  const durationMs = useDurationMs();
  const [inMs, setInMs] = useState<number | null>(null);
  const [outMs, setOutMs] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setIn = useCallback(() => setInMs(Math.round(playhead.getState().ms)), [playhead]);
  const setOut = useCallback(() => setOutMs(Math.round(playhead.getState().ms)), [playhead]);
  const clearMarks = useCallback(() => { setInMs(null); setOutMs(null); }, []);
  const clearError = useCallback(() => setError(null), []);

  const createScene = useCallback(async (range: SceneRange) => {
    const s = store.getState();
    if (s.readOnly.value) { setError(s.readOnly.reason ?? "Read only"); return false; }
    setCreating(true);
    setError(null);
    try {
      const title = titleFromLines(s.state.lines, range.startMs, range.endMs);
      const made = await s.mutate("project", (signal) =>
        api<{ id?: string }>(`/api/projects/${s.id}/clips`, { body: { title, startMs: range.startMs, endMs: range.endMs }, signal }));
      setInMs(null);
      setOutMs(null);
      if (made?.id) { store.getState().select([made.id]); playhead.getState().seekTo(range.startMs); }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Scene not saved.");
      return false;
    } finally {
      setCreating(false);
    }
  }, [store, playhead]);

  const markRange = useMemo(() => rangeFromMarks(inMs, outMs, durationMs), [inMs, outMs, durationMs]);
  const value = useMemo<FlatCtx>(
    () => ({ inMs, outMs, setIn, setOut, clearMarks, createScene, markRange, creating, error, clearError }),
    [inMs, outMs, setIn, setOut, clearMarks, createScene, markRange, creating, error, clearError],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** What "Add scene" would do now: the In and Out marks if set, else the line under the playhead. */
export function useAddScene() {
  const flat = useFlat();
  const lines = useProject((s) => s.state.lines);
  const readOnly = useProject((s) => s.readOnly);
  const durationMs = useDurationMs();
  const lineIndex = usePlayhead((s) => lineIndexAt(lines, s.ms));
  const range = flat.markRange ?? (lineIndex >= 0 ? rangeFromLine(lines[lineIndex], durationMs) : null);
  const reason = readOnly.value ? (readOnly.reason ?? "Read only") : range ? null : "Set In and Out, or play over a line";
  const add = useCallback(() => (range ? flat.createScene(range) : Promise.resolve(false)), [range, flat]);
  return { range, reason, add, creating: flat.creating };
}

/** Subscribe to a CSS media query. False on the server and until the first client render. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
