"use client";
import { useCallback, useMemo } from "react";
import { orderedScenes, type Clip } from "@/lib/scenes";
import { usePlayheadStore, useProject, useProjectStore } from "@/components/workspace/ProjectProvider";

/** Scenes in start order. Recomputed only when the clips array from the store changes. */
export function useScenes() {
  const clips = useProject((s) => s.state.clips);
  return useMemo(() => orderedScenes(clips), [clips]);
}

/** Why edits are off, or undefined when they are on. */
export function useReadOnlyReason(): string | undefined {
  return useProject((s) => (s.readOnly.value ? (s.readOnly.reason ?? "Read only") : undefined));
}

type ClickLike = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean };

/** Click grammar for scenes: click selects, Shift extends a range, Ctrl or Cmd toggles; the playhead goes to the start. */
export function useSceneActions() {
  const store = useProjectStore();
  const ph = usePlayheadStore();
  const pick = useCallback((clip: Pick<Clip, "id" | "startMs">, e: ClickLike) => {
    store.getState().select([clip.id], e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "replace");
    ph.getState().seekTo(clip.startMs);
  }, [store, ph]);
  const play = useCallback((clip: Pick<Clip, "startMs" | "endMs">) => ph.getState().playRange(clip.startMs, clip.endMs), [ph]);
  return { pick, play };
}

/** The proxy id to pull thumbnails from, or undefined for audio-only media (which has no frames). */
export function useFrameSource(): string | undefined {
  return useProject((s) => (s.state.proxy && !s.state.proxy.mime.startsWith("audio/") ? s.state.proxy.id : undefined));
}
