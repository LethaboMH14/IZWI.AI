"use client";
// One thumbnail per scene, in start order. Click selects and moves the playhead to the scene's start.
import { Plus } from "@phosphor-icons/react";
import { Button } from "@/components/z";
import { rangeText, sceneStatus } from "@/lib/scenes";
import { useProject } from "@/components/workspace/ProjectProvider";
import { FindHighlights } from "./FindHighlights";
import { useAddScene, useFlat } from "./flat-context";
import { useSceneActions, useScenes } from "./hooks";
import { SceneThumb } from "./SceneThumb";

export function SceneStrip() {
  const scenes = useScenes();
  const selection = useProject((s) => s.selection);
  const { pick, play } = useSceneActions();
  const add = useAddScene();
  const { error, clearError } = useFlat();
  const selected = new Set(selection);

  return (
    <div className="fs-stripbar">
      <div className="fs-strip" role="group" aria-label="Scenes">
        {scenes.length === 0 && <FindHighlights />}
        {scenes.map((clip) => {
          const status = sceneStatus(clip);
          const on = selected.has(clip.id);
          return (
            <button
              key={clip.id} type="button" className="fs-strip-item" aria-pressed={on} data-status={status.status}
              title={status.reason ?? clip.title}
              aria-label={`${clip.title}, ${rangeText(clip.startMs, clip.endMs)}, ${status.word}`}
              onClick={(e) => pick(clip, e)} onDoubleClick={() => play(clip)}
            >
              <SceneThumb startMs={clip.startMs} endMs={clip.endMs} />
              <span className="fs-mono fs-strip-range">{rangeText(clip.startMs, clip.endMs)}</span>
            </button>
          );
        })}
        <Button className="fs-add" loading={add.creating} disabled={!!add.reason} disabledReason={add.reason ?? undefined} onClick={() => { clearError(); void add.add(); }}>
          <Plus size={14} aria-hidden="true" />Add scene
        </Button>
      </div>
      {error && <p className="fs-error" role="alert">{error} <button type="button" className="fs-link" onClick={clearError}>Dismiss</button></p>}
    </div>
  );
}
