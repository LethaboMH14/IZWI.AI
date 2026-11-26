"use client";
// Scenes as rows (project panel, and the phone's Edit tab). Same click grammar as the strip.
import { DotsThree } from "@phosphor-icons/react";
import { DropdownMenu, IconButton, StatusPill, Tooltip, type MenuItem } from "@/components/z";
import { formatTime } from "@/lib/timecode";
import { rangeText, sceneStatus } from "@/lib/scenes";
import { useProject } from "@/components/workspace/ProjectProvider";
import { useSceneActions, useScenes } from "./hooks";
import { SceneThumb } from "./SceneThumb";

export function SceneList({ menu = false }: { menu?: boolean }) {
  const scenes = useScenes();
  const selection = useProject((s) => s.selection);
  const { pick, play } = useSceneActions();
  const selected = new Set(selection);
  return (
    <ul className="fs-scenes">
      {scenes.map((clip) => {
        const status = sceneStatus(clip);
        const pill = <span className="fs-pillwrap" tabIndex={status.reason ? 0 : undefined}><StatusPill status={status.status} label={status.word} /></span>;
        const items: MenuItem[] = [
          { heading: `${clip.title} · ${rangeText(clip.startMs, clip.endMs)}` },
          { id: "play", label: "Play scene", onSelect: () => play(clip) },
          { id: "tc", label: "Copy timecode", onSelect: () => void navigator.clipboard?.writeText(formatTime(clip.startMs)).catch(() => undefined) },
        ];
        return (
          <li key={clip.id} className="fs-scene" data-selected={selected.has(clip.id) || undefined}>
            <button type="button" className="fs-scene-btn" aria-pressed={selected.has(clip.id)} onClick={(e) => pick(clip, e)} onDoubleClick={() => play(clip)}>
              <SceneThumb startMs={clip.startMs} endMs={clip.endMs} />
              <span className="fs-scene-text">
                <span className="fs-scene-title">{clip.title}</span>
                <span className="fs-mono fs-scene-range">{rangeText(clip.startMs, clip.endMs)}</span>
              </span>
            </button>
            {status.reason ? <Tooltip content={status.reason}>{pill}</Tooltip> : pill}
            {menu && <DropdownMenu align="end" items={items} trigger={<IconButton label="Scene actions" size="md" icon={<DotsThree size={18} weight="bold" />} />} />}
          </li>
        );
      })}
    </ul>
  );
}
