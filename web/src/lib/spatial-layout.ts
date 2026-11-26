// The Spatial Canvas graph, computed from ProjectState only: Source → Scenes → Languages → Outputs, with People
// and Licence offers in a lower lane and pending AI trims attached to their scene. Pure and deterministic: every
// set is sorted with a tie-break before it is placed (doctrine 5), so the same project always draws the same map.
import type { ProjectState } from "@/server/state";
import { agentProposals, type ThreadProposal } from "./proposals";

export type NodeKind = "source" | "scene" | "language" | "output" | "person" | "offer" | "proposal";
export type Tone = "done" | "working" | "held" | "idle" | "proposal";
export type GraphNode = {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
  data: { title: string; meta: string; state: string; tone: Tone; refId: string; startMs?: number; endMs?: number };
};
export type GraphEdge = { id: string; source: string; target: string; kind: "flow" | "consent" | "offer" | "proposal"; tone: Tone; dashed: boolean };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[]; columns: { label: string; x: number; count: number }[] };

export const COL_W = 300;
export const ROW_H = 132;
const LOWER_GAP = 72;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const PRESET: Record<string, string> = { vertical: "Vertical 9:16", square: "Square 1:1", wide: "Wide 16:9", small: "Small 720p" };
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function buildGraph(state: ProjectState, opts: { languageName?: (code: string) => string; proposals?: ThreadProposal[] } = {}): Graph {
  const lang = opts.languageName ?? ((c: string) => c);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const place = (col: number, row: number, offsetY = 0) => ({ x: col * COL_W, y: offsetY + row * ROW_H });

  // Source
  const dur = state.source?.durationMs ?? state.proxy?.durationMs ?? 0;
  if (state.source) {
    nodes.push({ id: "src", kind: "source", position: place(0, 0), data: { title: "Full recording", meta: state.source.filename, state: state.lines.length ? "Transcribed" : "Not transcribed", tone: state.lines.length ? "done" : "idle", refId: state.source.id, startMs: 0, endMs: dur } });
  }

  // Scenes (clips that are not dropped), by start then id
  const scenes = state.clips.filter((c) => c.status !== "dropped").sort((a, b) => a.startMs - b.startMs || cmp(a.id, b.id));
  scenes.forEach((c, i) => {
    const held = !c.gate.ok;
    nodes.push({ id: `scene:${c.id}`, kind: "scene", position: place(1, i), data: { title: c.title, meta: `${mmss(c.startMs)} – ${mmss(c.endMs)}`, state: held ? "Held" : c.status === "kept" ? "Kept" : "Suggested", tone: held ? "held" : c.status === "kept" ? "done" : "proposal", refId: c.id, startMs: c.startMs, endMs: c.endMs } });
    if (state.source) edges.push({ id: `e:src>${c.id}`, source: "src", target: `scene:${c.id}`, kind: "flow", tone: held ? "held" : "idle", dashed: false });
  });

  // Languages: source track first, then translations by language code
  const tracks = [...state.tracks].sort((a, b) => (a.kind === b.kind ? cmp(a.language, b.language) || cmp(a.id, b.id) : a.kind === "source" ? -1 : 1));
  tracks.forEach((t, i) => {
    const isSource = t.kind === "source";
    nodes.push({ id: `lang:${t.id}`, kind: "language", position: place(2, i), data: { title: lang(t.language), meta: isSource ? `${t.lines} lines · source` : `${t.approved}/${t.lines} reviewed`, state: isSource ? "Source" : t.status === "approved" ? "Approved" : "Draft", tone: isSource ? "idle" : t.status === "approved" ? "done" : "working", refId: t.id } });
  });
  const trackFor = (language: string | null) => tracks.find((t) => (language ? t.language === language && t.kind !== "source" : t.kind === "source"));

  // Outputs by creation then id
  const outputs = [...state.outputs].sort((a, b) => a.createdAt - b.createdAt || cmp(a.id, b.id));
  outputs.forEach((o, i) => {
    const tone: Tone = o.status === "ready" ? "done" : o.status === "failed" || o.status === "blocked" ? "held" : "working";
    const word = o.posted ? "Marked as posted" : o.status === "ready" ? "Ready" : o.status === "blocked" ? "Held" : o.status === "failed" ? "Failed" : o.status === "running" ? "Rendering" : "Queued";
    nodes.push({ id: `out:${o.id}`, kind: "output", position: place(3, i), data: { title: PRESET[o.preset] ?? cap(o.preset), meta: o.language ? `${lang(o.language)} captions` : o.burn ? "Source captions" : "No captions", state: word, tone, refId: o.id } });
    if (o.clipId && scenes.some((c) => c.id === o.clipId)) edges.push({ id: `e:${o.clipId}>${o.id}`, source: `scene:${o.clipId}`, target: `out:${o.id}`, kind: "flow", tone, dashed: false });
    const t = trackFor(o.language);
    if (t) edges.push({ id: `e:${t.id}>${o.id}`, source: `lang:${t.id}`, target: `out:${o.id}`, kind: "flow", tone: "idle", dashed: false });
  });

  // Lower lane: people (column 2) and licence offers (column 3), below the taller of the upper columns
  const upperRows = Math.max(1, scenes.length, tracks.length, outputs.length);
  const lowerY = upperRows * ROW_H + LOWER_GAP;
  const people = [...state.people].sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id));
  people.forEach((p, i) => {
    const st = p.consent?.status;
    const tone: Tone = st === "granted" ? "done" : st === "requested" ? "working" : st ? "held" : "idle";
    nodes.push({ id: `person:${p.id}`, kind: "person", position: place(2, i, lowerY), data: { title: p.role ? `${p.name} · ${p.role}` : p.name, meta: p.consent ? p.consent.scope : "No request yet", state: st ? cap(st) : "Not asked", tone, refId: p.id } });
    for (const c of scenes) {
      const inRange = p.wholeRecording || p.ranges.some((r) => r.endMs > c.startMs && r.startMs < c.endMs);
      if (inRange) edges.push({ id: `e:${p.id}>${c.id}`, source: `person:${p.id}`, target: `scene:${c.id}`, kind: "consent", tone, dashed: st !== "granted" });
    }
  });
  const offers = [...state.listings].sort((a, b) => cmp(a.title, b.title) || cmp(a.id, b.id));
  offers.forEach((l, i) => {
    const n = Array.isArray(l.enquiries) ? l.enquiries.length : 0;
    nodes.push({ id: `offer:${l.id}`, kind: "offer", position: place(3, i, lowerY), data: { title: "Licence offer", meta: l.title, state: n ? `${n} ${n === 1 ? "enquiry" : "enquiries"}` : l.enabled ? "Live" : "Off", tone: n ? "working" : l.enabled ? "done" : "idle", refId: l.id } });
    if (scenes.some((c) => c.id === l.clipId)) edges.push({ id: `e:${l.clipId}>offer:${l.id}`, source: `scene:${l.clipId}`, target: `offer:${l.id}`, kind: "offer", tone: "idle", dashed: false });
  });

  // Pending AI trims, under the scene column's last row, linked to their scene
  const pending = agentProposals(opts.proposals ?? [], state).filter((p) => p.status === "proposed" && p.trim && scenes.some((c) => c.id === p.trim!.clipId));
  pending.sort((a, b) => cmp(a.planId, b.planId)).forEach((p, i) => {
    const t = p.trim!;
    const secs = Math.round((t.proposed.endMs - t.proposed.startMs) / 1000);
    nodes.push({ id: `prop:${p.planId}`, kind: "proposal", position: place(1, i, lowerY), data: { title: p.title || "Trim", meta: `${mmss(t.proposed.startMs)} – ${mmss(t.proposed.endMs)} · ${secs}s`, state: "Proposal", tone: "proposal", refId: p.planId, startMs: t.proposed.startMs, endMs: t.proposed.endMs } });
    edges.push({ id: `e:prop:${p.planId}>${t.clipId}`, source: `prop:${p.planId}`, target: `scene:${t.clipId}`, kind: "proposal", tone: "proposal", dashed: true });
  });

  const columns = [
    { label: "Source", x: 0, count: state.source ? 1 : 0 },
    { label: "Scenes", x: COL_W, count: scenes.length },
    { label: "Languages", x: COL_W * 2, count: tracks.length },
    { label: "Outputs", x: COL_W * 3, count: outputs.length },
  ];
  return { nodes, edges, columns };
}

/** Ids of nodes connected to the selection, so their edges can be lit. */
export function litEdges(graph: Graph, selectedNodeIds: Set<string>): Set<string> {
  const lit = new Set<string>();
  for (const e of graph.edges) if (selectedNodeIds.has(e.source) || selectedNodeIds.has(e.target)) lit.add(e.id);
  return lit;
}
