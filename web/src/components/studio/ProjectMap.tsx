"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Cube, FilmSlate, LockSimple, LockSimpleOpen, Square } from "@phosphor-icons/react";
import { clock, media } from "@/lib/format";
import { langName } from "@/lib/languages";
import { storyScenes } from "@/lib/story-scenes";
import type { EditTarget, PanelTarget, ProjectState } from "./types";

type Card = EditTarget & { key: string; detail: string; relation?: string; parents?: string[]; target?: PanelTarget; src?: string; poster?: string; clip?: ProjectState["clips"][number]; image?: boolean; audio?: boolean };
type Lane = { title: string; cards: Card[] };

function makeLanes(state: ProjectState, rights: boolean): Lane[] {
  const source = state.proxy ?? state.source;
  const poster = state.poster ? media(state.poster.id) : undefined;
  const clips = state.clips.filter((clip) => clip.status !== "dropped");
  const clipCards: Card[] = clips.map((clip) => ({
    key: clip.id, label: clip.title, clip, tab: "create", focusId: clip.id,
    detail: rights ? (clip.gate.ok ? "Cleared to render" : `Held · ${[!clip.gate.declaration && "declaration", ...clip.gate.waiting.map((person) => person.name)].filter(Boolean).join(", ")}`) : `${clock(clip.startMs)}–${clock(clip.endMs)} · ${clip.status}`,
    relation: rights ? state.people.filter((person) => person.wholeRecording || person.ranges.some((range) => range.startMs < clip.endMs && range.endMs > clip.startMs)).map((person) => person.name).join(", ") : state.project.title,
    parents: rights ? state.people.filter((person) => person.wholeRecording || person.ranges.some((range) => range.startMs < clip.endMs && range.endMs > clip.startMs)).map((person) => person.id) : ["source"],
    target: { kind: "clip", id: clip.id }, src: source ? media(source.id) : undefined, poster, audio: !!source?.mime.startsWith("audio/"),
  }));
  const outputs: Card[] = state.outputs.map((output) => ({
    key: output.id, label: `${output.preset} · ${output.language ? langName(output.language) : "Original"}`, detail: output.note ?? output.status,
    relation: state.clips.find((clip) => clip.id === output.clipId)?.title,
    parents: output.clipId ? [output.clipId] : [],
    target: { kind: "output", id: output.id }, tab: "publish", focusId: `output-${output.id}`,
    src: output.asset ? media(output.asset.id) : undefined,
  }));
  return [
    { title: rights ? "People" : "Source", cards: rights ? state.people.map((person) => ({
      key: person.id, label: person.name, detail: `${person.role} · ${person.consent?.status ?? "Consent needed"}`,
      target: { kind: "person", id: person.id }, tab: "protect", focusId: `person-${person.id}`,
    })) : source ? [{
      key: "source", label: state.project.title, detail: `${state.source?.filename ?? source.filename} · ${clock(source.durationMs)}`,
      src: media(source.id), poster, image: source.mime.startsWith("image/"), audio: source.mime.startsWith("audio/"), tab: "create",
    }] : state.project.script ? [{
      key: "source", label: "Project script", detail: state.project.title, tab: "create", focusId: "storyboard",
    }] : [] },
    { title: rights ? "Clips" : "Scenes and clips", cards: rights ? clipCards : [
      ...clipCards,
      ...storyScenes(state.project.script).map((scene, index): Card => ({
        key: `scene-${index}`, label: `Scene ${index + 1}`, detail: scene.text, relation: state.project.title,
        parents: ["source"],
        tab: "create", focusId: "storyboard", target: { kind: "scene", id: String(index) },
      })),
    ] },
    { title: rights ? "Renders" : "Outputs", cards: rights ? outputs : [
      ...outputs,
      ...state.tracks.map((track): Card => ({
        key: track.id, label: `${langName(track.language)} ${track.kind === "source" ? "transcript" : "captions"}`,
        detail: `${track.approved}/${track.lines} lines approved`, relation: state.project.title,
        parents: ["source"],
        target: { kind: "track", id: track.id }, tab: track.kind === "source" ? "create" : "localise", focusId: track.id,
      })),
    ] },
  ];
}

function Preview({ card }: { card: Card }) {
  if (!card.src) return null;
  const src = card.clip ? `${card.src}#t=${card.clip.startMs / 1000},${card.clip.endMs / 1000}` : card.src;
  if (card.image) {
    // Private assets are served through the authenticated media route.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="map-preview" src={src} alt={card.label} />;
  }
  return card.audio ? <audio className="map-audio" src={src} controls preload="metadata" aria-label={card.label} />
    : <video className="map-preview" src={src} poster={card.poster} controls playsInline preload="metadata" aria-label={card.label} />;
}

type Wire = { key: string; from: string; to: string; path: string };

function useWires(cards: Card[], space: boolean, selected: string | null, grid: React.RefObject<HTMLDivElement | null>) {
  const [wires, setWires] = useState<Wire[]>([]);
  useLayoutEffect(() => {
    const root = grid.current;
    if (!root) return;
    const nodes = new Map(Array.from(root.querySelectorAll<HTMLElement>("[data-map-key]"), (node) => [node.dataset.mapKey, node]));
    let frame = 0;
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      const next = cards.flatMap((card) => (card.parents ?? []).flatMap((id) => {
        const parent = nodes.get(id)?.getBoundingClientRect();
        const child = nodes.get(card.key)?.getBoundingClientRect();
        if (!parent || !child) return [];
        const x1 = parent.right - bounds.left, x2 = child.left - bounds.left;
        const y1 = parent.top + parent.height / 2 - bounds.top, y2 = child.top + child.height / 2 - bounds.top;
        if (x2 <= x1) return [];
        const middle = (x1 + x2) / 2;
        return [{ key: `${id}:${card.key}`, from: id, to: card.key, path: `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}` }];
      }));
      setWires(next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    nodes.forEach((node) => observer.observe(node));
    root.addEventListener("transitionend", schedule);
    schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); root.removeEventListener("transitionend", schedule); };
  }, [cards, grid, space, selected]);
  return wires;
}

export function ProjectMap({ state, rights, busy, onAsk, onEdit }: {
  state: ProjectState; rights: boolean; busy: boolean;
  onAsk: (prompt: string, target?: PanelTarget, label?: string, rights?: boolean) => void;
  onEdit: (card: EditTarget) => void;
}) {
  const [space, setSpace] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const grid = useRef<HTMLDivElement>(null);
  const lanes = useMemo(() => makeLanes(state, rights), [state, rights]);
  const cards = useMemo(() => lanes.flatMap((lane) => lane.cards), [lanes]);
  const wires = useWires(cards, space, selected, grid);
  const card = cards.find((candidate) => candidate.key === selected) ?? cards[0];
  const clips = lanes[1].cards;
  const index = clips.findIndex((candidate) => candidate === card);
  const MoveIcon = card?.clip?.gate.ok ? LockSimpleOpen : LockSimple;
  const prompt = card ? drafts[card.key] ?? "" : "";

  return (
    <section className={`project-map${space ? " in-space" : ""}`} aria-label={rights ? "Rights map" : "Story map"}>
      <header className="project-map-head">
        <h2>{rights ? "Rights map" : "Story map"}</h2>
        <div className="seg" aria-label="Map view">
          <button type="button" aria-pressed={!space} className={!space ? "on" : ""} onClick={() => setSpace(false)}><Square /> Flat</button>
          <button type="button" aria-pressed={space} className={space ? "on" : ""} onClick={() => setSpace(true)}><Cube /> 3D</button>
        </div>
      </header>
      <div className="project-map-lanes" ref={grid}>
        <svg className="map-wires" aria-hidden="true">
          {wires.map((wire) => <path key={wire.key} d={wire.path} className={wire.from === card?.key || wire.to === card?.key ? "active" : ""} />)}
        </svg>
        {lanes.map((lane) => (
          <section key={lane.title} className="map-lane">
            <h3>{lane.title}</h3>
            {lane.cards.length === 0 && <p className="fine">Nothing here yet.</p>}
            {lane.cards.map((node) => (
              <button type="button" className="map-card" data-map-key={node.key} key={node.key} onClick={() => setSelected(node.key)} aria-pressed={card?.key === node.key}>
                <b>{node.label}</b><small>{node.detail}</small>
                {node.relation && <span>↳ {node.relation}</span>}
              </button>
            ))}
          </section>
        ))}
      </div>
      {card && (
        <div className="map-inspect">
          <div className="map-inspect-head">
            <h3>{rights && card.clip && <MoveIcon aria-hidden="true" />} {card.label}</h3>
            {index >= 0 && <div className="map-pagination">
              <button type="button" className="btn btn-quiet btn-sm" disabled={index === 0} aria-label="Previous scene or clip" onClick={() => setSelected(clips[index - 1].key)}><ArrowLeft /></button>
              <span>{index + 1}/{clips.length}</span>
              <button type="button" className="btn btn-quiet btn-sm" disabled={index === clips.length - 1} aria-label="Next scene or clip" onClick={() => setSelected(clips[index + 1].key)}><ArrowRight /></button>
            </div>}
          </div>
          <p>{card.detail}</p>
          <Preview key={card.key} card={card} />
          {card.clip?.reason && <p className="map-reason"><FilmSlate /> {card.clip.reason}</p>}
          <button type="button" className="link" onClick={() => onEdit(card)}>{rights && card.target?.kind === "person" ? "Manage consent" : `Open in ${card.tab}`} <ArrowRight /></button>
          <form className="map-prompt" onSubmit={(event) => { event.preventDefault(); onAsk(prompt, card.target, card.label, rights); }}>
            <label className="field">
              <span>Prompt for {card.label}</span>
              <textarea rows={2} maxLength={600} value={prompt} onChange={(event) => setDrafts({ ...drafts, [card.key]: event.target.value })}
                placeholder={rights ? "What still needs permission?" : card.clip ? "Render this clip" : card.target?.kind === "scene" ? "Make this scene shorter" : "Describe what you want to make"} />
            </label>
            <button type="submit" className="btn btn-sm" disabled={busy || prompt.trim().length < 3}>Send <ArrowRight /></button>
          </form>
        </div>
      )}
    </section>
  );
}
