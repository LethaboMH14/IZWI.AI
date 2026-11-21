"use client";
// The real story map: Source -> Clips -> Outputs in three fixed columns. Nodes are buttons with full,
// wrapping titles. Connectors are measured from the cards' edges and only ever run in the gutters
// between columns, so they cannot pass behind a card. Below ~700px the columns stack and connectors hide.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { langName } from "@/lib/languages";
import { clock } from "@/lib/format";
import type { TabId } from "./types";

export type LiveMap = {
  title: string;
  durationMs: number | null;
  clips: { id: string; title: string; startMs: number; endMs: number; status: string }[];
  outputs: { id: string; clipId: string | null; preset: string; language: string | null; status: string; note: string | null }[];
  tracks: { id: string; language: string; kind: string; status: string; lines: number; approved: number }[];
};

type Status = "done" | "draft" | "blocked";
type Leaf = { id: string; parent: string; label: string; sub: string; status: Status; to: TabId };
type Mid = { id: string; label: string; sub: string; suggested: boolean; virtual: boolean };
type Edge = { id: string; from: string; to: string; status: Status | "trunk" };

const PRESET: Record<string, string> = { vertical: "9:16 vertical", square: "1:1 square", wide: "16:9 wide", small: "720p small" };
const WHOLE = "whole";
const GONE = "gone";
const SRC = "source";

function build(d: LiveMap) {
  const shown = d.clips.filter((c) => c.status !== "dropped");
  const ids = new Set(shown.map((c) => c.id));
  const mids: Mid[] = shown.map((c, i) => ({ id: c.id, label: c.title || `Clip ${i + 1}`, sub: `${clock(c.startMs)} to ${clock(c.endMs)}${c.status === "suggested" ? " · suggested" : ""}`, suggested: c.status === "suggested", virtual: false }));
  const leaves: Leaf[] = [];
  for (const o of d.outputs) {
    const status: Status = o.status === "ready" ? "done" : o.status === "queued" ? "draft" : "blocked";
    const word = o.status === "ready" ? "Ready" : o.status === "queued" ? "Rendering" : o.status === "failed" ? "Failed" : "Held";
    const parent = o.clipId && ids.has(o.clipId) ? o.clipId : GONE;
    leaves.push({ id: o.id, parent, label: `${o.language ? langName(o.language) : "Original language"} · ${PRESET[o.preset] ?? o.preset}`, sub: o.note && o.status !== "ready" ? `${word} · ${o.note}` : word, status, to: "publish" });
  }
  for (const t of d.tracks) {
    if (t.kind === "source") leaves.push({ id: t.id, parent: WHOLE, label: `${langName(t.language)} · transcript`, sub: `${t.lines} line${t.lines === 1 ? "" : "s"}`, status: "done", to: "create" });
    else {
      const ok = t.status === "approved";
      leaves.push({ id: t.id, parent: WHOLE, label: `${langName(t.language)} · captions`, sub: ok ? "Approved" : `Draft · ${t.approved} of ${t.lines} lines approved`, status: ok ? "done" : "draft", to: "localise" });
    }
  }
  if (leaves.some((l) => l.parent === WHOLE)) mids.push({ id: WHOLE, label: "Whole recording", sub: "Transcript and captions", suggested: false, virtual: true });
  if (leaves.some((l) => l.parent === GONE)) mids.push({ id: GONE, label: "Clips no longer kept", sub: "Renders made before a clip was dropped", suggested: false, virtual: true });
  // Group outputs by their clip's order so connectors stay as untangled as possible.
  const rank = new Map(mids.map((m, i) => [m.id, i]));
  leaves.sort((a, b) => (rank.get(a.parent) ?? 99) - (rank.get(b.parent) ?? 99));
  const edges: Edge[] = [
    ...mids.map((m) => ({ id: `s-${m.id}`, from: SRC, to: m.id, status: "trunk" as const })),
    ...leaves.map((l) => ({ id: `l-${l.id}`, from: l.parent, to: l.id, status: l.status })),
  ];
  return { mids, leaves, edges };
}

type Path = { id: string; d: string };

export function StoryGraph({ live, onOpen }: { live: LiveMap; onOpen?: (to: TabId) => void }) {
  const { mids, leaves, edges } = useMemo(() => build(live), [live]);
  const box = useRef<HTMLDivElement>(null);
  const [nodes] = useState(() => new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<Path[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hot, setHot] = useState<string | null>(null);
  const reg = (id: string) => (el: HTMLElement | null) => { if (el) nodes.set(id, el); else nodes.delete(id); };

  const measure = useCallback(() => {
    const root = box.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    const out: Path[] = [];
    for (const e of edges) {
      const a = nodes.get(e.from), b = nodes.get(e.to);
      if (!a || !b) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const x1 = ra.right - r.left, y1 = ra.top + ra.height / 2 - r.top, x2 = rb.left - r.left, y2 = rb.top + rb.height / 2 - r.top;
      const m = (x1 + x2) / 2;
      out.push({ id: e.id, d: `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}` });
    }
    setPaths(out);
    setSize({ w: r.width, h: r.height });
  }, [edges, nodes]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [measure]);
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    let raf = 0;
    const again = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const ro = new ResizeObserver(again);
    ro.observe(root);
    nodes.forEach((n) => ro.observe(n));
    if (document.fonts?.ready) void document.fonts.ready.then(again);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [measure, mids, leaves, nodes]);

  // What is related to the hovered or focused node: its source, its clip, its outputs.
  const related = useMemo(() => {
    if (!hot) return null;
    const s = new Set<string>([hot, SRC]);
    const leaf = leaves.find((l) => l.id === hot);
    if (leaf) s.add(leaf.parent);
    if (mids.some((m) => m.id === hot)) leaves.filter((l) => l.parent === hot).forEach((l) => s.add(l.id));
    return s;
  }, [hot, leaves, mids]);
  const dim = (id: string) => (related && !related.has(id) ? " dim" : "");
  const bind = (id: string) => ({ onMouseEnter: () => setHot(id), onMouseLeave: () => setHot(null), onFocus: () => setHot(id), onBlur: () => setHot(null) });
  const empty = mids.length === 0 && leaves.length === 0;
  const labelOf = (id: string) => mids.find((m) => m.id === id)?.label ?? "";

  return (
    <div className="sg" role="group" aria-label={`${live.title} has ${mids.filter((m) => !m.virtual).length} clip${mids.filter((m) => !m.virtual).length === 1 ? "" : "s"} and ${leaves.length} output${leaves.length === 1 ? "" : "s"}. Each card opens the stage where you work on it.`}>
      <div className="sg-grid" ref={box}>
        <svg className="sg-wires" width={size.w} height={size.h} viewBox={`0 0 ${Math.max(1, size.w)} ${Math.max(1, size.h)}`} aria-hidden>
          {paths.map((p) => {
            const e = edges.find((x) => x.id === p.id)!;
            const on = !related || (related.has(e.from) && related.has(e.to));
            return <path key={p.id} d={p.d} className={`sg-wire s-${e.status}` + (on ? (related ? " hot" : "") : " dim")} />;
          })}
        </svg>

        <section className="sg-col sg-c1" aria-label="Source">
          <h3>Source</h3>
          <button type="button" ref={reg(SRC)} className={"sg-node sg-src" + dim(SRC)} onClick={() => onOpen?.("create")} {...bind(SRC)}>
            <b>{live.title}</b>
            <span>{clock(live.durationMs)} recording</span>
            <em>Open in Create</em>
          </button>
        </section>

        <section className="sg-col sg-c2" aria-label="Clips">
          <h3>Clips</h3>
          {mids.length === 0 && <p className="sg-none">{empty ? "No clips yet." : "No clips kept."}</p>}
          {mids.map((m) => (
            <button type="button" key={m.id} ref={reg(m.id)} className={"sg-node sg-clip" + (m.suggested ? " sug" : "") + (m.virtual ? " virt" : "") + dim(m.id)} onClick={() => onOpen?.(m.id === WHOLE ? "localise" : "create")} {...bind(m.id)}>
              <b>{m.label}</b>
              <span className={m.virtual ? "" : "mono"}>{m.sub}</span>
            </button>
          ))}
        </section>

        <section className="sg-col sg-c3" aria-label="Outputs">
          <h3>Outputs</h3>
          {leaves.length === 0 && <p className="sg-none">{empty ? "Nothing has been made from this recording yet." : "No renders or captions yet."}</p>}
          {leaves.map((l) => (
            <button type="button" key={l.id} ref={reg(l.id)} className={`sg-node sg-leaf s-${l.status}` + dim(l.id)} onClick={() => onOpen?.(l.to)} {...bind(l.id)}>
              <small className="sg-from">From {labelOf(l.parent)}</small>
              <b><i aria-hidden /> {l.label}</b>
              <span>{l.sub}</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
