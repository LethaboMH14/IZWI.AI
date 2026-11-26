"use client";
// The scene being worked on: the first selected scene, else the scene under the playhead, else the project.
import { useEffect, useRef, useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";
import { StatusPill, Tooltip } from "@/components/z";
import { api } from "@/lib/api";
import { focusScene, rangeText, sceneLabel, sceneStatus } from "@/lib/scenes";
import { usePlayhead, useProject, useProjectStore } from "@/components/workspace/ProjectProvider";
import { useReadOnlyReason, useScenes } from "./hooks";
import { messageOf } from "./jobs";

function EditableTitle({ value, label, disabledReason, onSave }: {
  value: string;
  label: string;
  disabledReason?: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);

  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);
  const startEditing = () => { setDraft(value); setEditing(true); };

  const finish = (restoreFocus: boolean) => {
    setEditing(false);
    if (restoreFocus) requestAnimationFrame(() => button.current?.focus());
  };
  const save = async () => {
    const next = draft.replace(/\s+/g, " ").trim();
    if (!next || next === value) { finish(true); return; }
    setBusy(true); setError(null);
    try { await onSave(next.slice(0, 120)); finish(true); } catch (cause) { setError(messageOf(cause, "Title not saved.")); } finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="fs-title-edit">
        <input
          ref={input} className="fs-title-input" value={draft} maxLength={120} disabled={busy} aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void save(); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelled.current = true; setError(null); setDraft(value); finish(true); }
          }}
          onBlur={() => { if (cancelled.current) { cancelled.current = false; return; } if (!busy) void save(); }}
        />
        {error && <span className="fs-error" role="alert">{error}</span>}
      </div>
    );
  }
  const trigger = (
    <button ref={button} type="button" className="fs-title-btn" aria-label={`${label}: ${value}`} aria-disabled={disabledReason ? true : undefined}
       onClick={() => { if (!disabledReason) { cancelled.current = false; startEditing(); } }}>
      <span>{value}</span>
      <PencilSimple size={16} aria-hidden="true" className="fs-title-icon" />
    </button>
  );
  return disabledReason ? <Tooltip content={disabledReason}>{trigger}</Tooltip> : trigger;
}

export function SceneHeader({ compact = false }: { compact?: boolean }) {
  const store = useProjectStore();
  const scenes = useScenes();
  const selection = useProject((s) => s.selection);
  const projectTitle = useProject((s) => s.state.project.title);
  const readOnly = useReadOnlyReason();
  const sceneId = usePlayhead((s) => focusScene(scenes, selection, s.ms)?.id ?? null);
  const scene = sceneId ? scenes.find((c) => c.id === sceneId) ?? null : null;

  if (!scene) {
    return (
      <header className="fs-head">
        <div className="fs-head-text">
          <h1 className="fs-h1">
            <EditableTitle value={projectTitle} label="Project title" disabledReason={readOnly}
              onSave={(title) => store.getState().mutate("project", (signal) => api(`/api/projects/${store.getState().id}`, { method: "PATCH", body: { title }, signal }).then(() => undefined))} />
          </h1>
          <div className="fs-sub">Project · {scenes.length ? `${scenes.length} ${scenes.length === 1 ? "scene" : "scenes"}` : "No scenes yet"}</div>
        </div>
      </header>
    );
  }
  const status = sceneStatus(scene);
  const pill = <span className="fs-pillwrap" tabIndex={status.reason ? 0 : undefined}><StatusPill status={status.status} label={status.word} /></span>;
  return (
    <header className="fs-head">
      <div className="fs-head-text">
        <h1 className="fs-h1">
          <EditableTitle value={scene.title} label="Scene title" disabledReason={readOnly}
            onSave={(title) => store.getState().mutate(`clip:${scene.id}`, (signal) => api(`/api/items/clip/${scene.id}`, { method: "PATCH", body: { title }, signal }).then(() => undefined))} />
        </h1>
        <div className="fs-sub">
          {!compact && <>{projectTitle} · </>}{sceneLabel(scenes, scene.id)}
          {compact && <> · <span className="fs-mono">{rangeText(scene.startMs, scene.endMs)}</span></>}
        </div>
      </div>
      {status.reason ? <Tooltip content={status.reason}>{pill}</Tooltip> : pill}
    </header>
  );
}
