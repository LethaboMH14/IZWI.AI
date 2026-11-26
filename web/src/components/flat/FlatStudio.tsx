"use client";
// The Flat Studio layout: project panel, editor (header, preview, scene strip) beside the transcript, the
// timeline under them and the agent on the right. Below 1280 px the project panel is a drawer, below 1024 px the
// agent is too, and on a phone everything stacks in one column with Edit, Transcript, Captions and Notes tabs.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Robot, SidebarSimple } from "@phosphor-icons/react";
import { Button, Tabs } from "@/components/z";
import "@/app/flat.css";
import { nudge } from "@/lib/scenes";
import { usePlayheadStore, useProjectStore } from "@/components/workspace/ProjectProvider";
import { CaptionsView } from "./CaptionsView";
import { FlatProvider, useAddScene, useDurationMs, useFlat, useMedia } from "./flat-context";
import { NotesView, useOpenNotes } from "./NotesView";
import { Preview } from "./Preview";
import { ProjectPanel } from "./ProjectPanel";
import { SceneHeader } from "./SceneHeader";
import { SceneList } from "./SceneList";
import { SceneStrip } from "./SceneStrip";
import { TranscriptPanel } from "./TranscriptPanel";
import { TranscriptView } from "./TranscriptView";
import { FindHighlights } from "./FindHighlights";
import { useScenes } from "./hooks";

// Keys are ignored while the user is typing, in a menu, or on a control that owns the key.
function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='menu'], [role='menuitem'], [role='dialog']")) return true;
  if (target.closest("[role='tablist'], [role='slider']") || target.matches("input[type='range']")) return key.startsWith("Arrow") || key === " ";
  if (target.closest("button, a[href], summary")) return key === " " || key === "Enter";
  return false;
}

function Shortcuts({ closeDrawers }: { closeDrawers: () => boolean }) {
  const store = useProjectStore();
  const ph = usePlayheadStore();
  const durationMs = useDurationMs();
  const flat = useFlat();
  const add = useAddScene();
  // Always call the latest handler without re-binding the window listener.
  const latest = useRef<(e: KeyboardEvent) => void>(() => undefined);
  const handleKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") {
      if (ownsKey(e.target, e.key) && !(e.target as HTMLElement).closest("input, textarea")) return;
      if (closeDrawers()) return;
      if (!(e.target as HTMLElement | null)?.closest?.("input, textarea, [role='menu']")) store.getState().clearSelection();
      return;
    }
    if (ownsKey(e.target, e.key)) return;
    const p = ph.getState();
    switch (e.key) {
      case " ": e.preventDefault(); p.togglePlay(); break;
      case "ArrowLeft": e.preventDefault(); p.seekTo(nudge(p.ms, e.shiftKey ? -5000 : -1000, durationMs)); break;
      case "ArrowRight": e.preventDefault(); p.seekTo(nudge(p.ms, e.shiftKey ? 5000 : 1000, durationMs)); break;
      case "i": case "I": e.preventDefault(); flat.setIn(); break;
      case "o": case "O": e.preventDefault(); flat.setOut(); break;
      case "Enter": if (flat.markRange && !add.reason) { e.preventDefault(); void flat.createScene(flat.markRange); } break;
    }
  };
  useEffect(() => {
    latest.current = handleKey;
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => latest.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  return null;
}

function PhoneEdit({ agent }: { agent: ReactNode }) {
  const scenes = useScenes();
  return (
    <div className="fs-phone-edit">
      <div className="fs-agent-card">{agent}</div>
      <h2 className="fs-sec-h"><span>Scenes</span><span className="fs-mono">{scenes.length}</span></h2>
      {scenes.length === 0 ? <FindHighlights /> : <SceneList menu />}
    </div>
  );
}

function Phone({ agent }: { agent: ReactNode }) {
  const notes = useOpenNotes();
  return (
    <div className="fs fs-phone">
      <Preview />
      <SceneHeader compact />
      <Tabs
        label="Edit" defaultValue="edit"
        items={[
          { value: "edit", label: "Edit", panel: <PhoneEdit agent={agent} /> },
          { value: "transcript", label: "Transcript", panel: <TranscriptView /> },
          { value: "captions", label: "Captions", panel: <CaptionsView /> },
          { value: "notes", label: notes > 0 ? `Notes ${notes}` : "Notes", panel: <NotesView /> },
        ]}
      />
    </div>
  );
}

function Desktop({ timeline, agent }: { timeline: ReactNode; agent: ReactNode }) {
  const [project, setProject] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const projectBtn = useRef<HTMLButtonElement>(null);
  const agentBtn = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const closeDrawers = useCallback(() => {
    if (!project && !agentOpen) return false;
    const back = project ? projectBtn.current : agentBtn.current;
    setProject(false); setAgentOpen(false);
    back?.focus();
    return true;
  }, [project, agentOpen]);
  const open = (which: "project" | "agent") => {
    setProject(which === "project"); setAgentOpen(which === "agent");
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-drawer="${which}"] button, [data-drawer="${which}"] a, [data-drawer="${which}"] input`)?.focus());
  };

  return (
    <div className="fs" ref={root} data-project-open={project} data-agent-open={agentOpen}>
      <Shortcuts closeDrawers={closeDrawers} />
      <div className="fs-toggles">
        <Button ref={projectBtn} size="sm" className="fs-toggle-project" aria-expanded={project} onClick={() => (project ? closeDrawers() : open("project"))}><SidebarSimple size={16} aria-hidden="true" />Project</Button>
        <Button ref={agentBtn} size="sm" className="fs-toggle-agent" aria-expanded={agentOpen} onClick={() => (agentOpen ? closeDrawers() : open("agent"))}><Robot size={16} aria-hidden="true" />Agent</Button>
      </div>
      <aside className="fs-project" aria-label="Project" data-drawer="project"><ProjectPanel onClose={closeDrawers} /></aside>
      <section className="fs-editor" aria-label="Editor">
        <SceneHeader />
        <Preview />
        <SceneStrip />
      </section>
      <section className="fs-text" aria-label="Text"><TranscriptPanel /></section>
      <section className="fs-timeline" aria-label="Timeline">{timeline}</section>
      <aside className="fs-agent" aria-label="IZWI Editing Agent" data-drawer="agent">{agent}</aside>
      <div className="fs-scrim" aria-hidden="true" onClick={closeDrawers} />
    </div>
  );
}

export function FlatStudio({ timeline, agent }: { timeline: ReactNode; agent: ReactNode }) {
  const phone = useMedia("(max-width: 767px)");
  return (
    <FlatProvider>
      {phone ? <><Shortcuts closeDrawers={() => false} /><Phone agent={agent} /></> : <Desktop timeline={timeline} agent={agent} />}
    </FlatProvider>
  );
}
