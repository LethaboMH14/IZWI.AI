"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BaseEdge, Handle, Position, ReactFlow, ReactFlowProvider, getBezierPath, useReactFlow, useViewport, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { CaretLeft, DotsThree, Minus, Plus, Play } from "@phosphor-icons/react";
import { api, newKey } from "@/lib/api";
import { askAgent } from "@/lib/agent-bus";
import { buildGraph, litEdges, type Graph, type GraphEdge, type GraphNode } from "@/lib/spatial-layout";
import { langName } from "@/lib/languages";
import { trimBlocked } from "@/lib/timeline-math";
import { useFrame } from "@/lib/frames";
import { usePlayheadStore, useProject, useProjectStore } from "@/components/workspace/ProjectProvider";
import "@/app/spatial.css";

type Props = { backdrop?: ReactNode; timeline: ReactNode; agentCard: ReactNode };
type MenuItem = { label: string; run?: () => void; items?: MenuItem[]; disabled?: boolean; tone?: "ai" };
type Scope = "appearance" | "voice" | "likeness";
const PRESETS = [["vertical", "Vertical 9:16"], ["square", "Square 1:1"], ["wide", "Wide 16:9"]] as const;
const SCOPES: [Scope, string][] = [["appearance", "Appearance"], ["voice", "Voice"], ["likeness", "Likeness"]];
type SpatialNodeData = GraphNode["data"] & { kind: GraphNode["kind"]; proxyId?: string | null; menu?: (at: { x: number; y: number }) => void };
type SpatialEdgeData = GraphEdge & { lit?: boolean };
type FlowNode = Node<SpatialNodeData, "spatial">;
type Tab = "Selected" | "Links" | "AI";

function Frame({ proxyId, ms, className }: { proxyId?: string | null; ms?: number; className?: string }) {
  const src = useFrame(proxyId, ms ?? 0);
  return src ? <img className={className ?? "sp-thumb"} src={src} alt="" /> : <div className={className ?? "sp-thumb"} aria-hidden="true" />;
}

function SpatialCard({ id, data, selected }: NodeProps<FlowNode>) {
  const visual = <>
    {(data.kind === "source" || data.kind === "scene") && <Frame proxyId={data.proxyId} ms={data.startMs} />}
    <div className="sp-node-copy"><div className="sp-node-title">{data.title}</div><div className="sp-node-meta">{data.meta}</div><span className="sp-pill" data-tone={data.tone}>{data.state}</span></div>
  </>;
  return <div className={`sp-node${selected ? " is-selected" : ""}${data.tone === "held" ? " is-held" : ""}${data.kind === "proposal" ? " is-proposal" : ""}`} aria-label={`${data.kind}: ${data.title}, ${data.state}`}>
    <Handle type="target" position={Position.Left} aria-hidden="true" />
    <div className="sp-node-top">{visual}</div>
    {data.menu && <button className="sp-node-menu" aria-label={`More actions for ${data.title}`} title="More" onClick={(event) => { event.stopPropagation(); const r = event.currentTarget.getBoundingClientRect(); data.menu?.({ x: r.right, y: r.bottom + 4 }); }}><DotsThree size={21} weight="bold" /></button>}
    <Handle type="source" position={Position.Right} aria-hidden="true" />
  </div>;
}

function SpatialLink({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<SpatialEdgeData>>) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const color = data?.tone === "held" ? "#974a3b" : data?.lit ? "var(--z-edge-lit,#efb54b)" : "var(--z-edge,rgba(231,153,34,.35))";
  return <BaseEdge id={id} path={path} style={{ stroke: color, strokeWidth: data?.lit ? 2.2 : 1.4, strokeDasharray: data?.dashed ? "5 4" : undefined, filter: data?.lit ? "drop-shadow(0 0 5px rgba(239,181,75,.55))" : undefined }} />;
}

// Fixed card size: React Flow keeps unmeasured nodes hidden and unclickable, and every card has the same layout.
const NODE_W = 236;
const NODE_H = 88;
const nodeTypes = { spatial: SpatialCard };
const edgeTypes = { spatial: SpatialLink };

function CanvasScene({ graph, onFitColumn }: { graph: Graph; onFitColumn: (label: string) => void }) {
  const { x, y, zoom } = useViewport();
  const top = graph.nodes.length ? Math.min(...graph.nodes.map((n) => n.position.y)) : 0;
  const labels = graph.columns.map((column) => <button key={column.label} type="button" className="sp-col-label" onClick={() => onFitColumn(column.label)} style={{ transform: `translate(${x + column.x * zoom}px, ${y + (top - 30) * zoom}px)`, left: 22, top: 0, fontSize: Math.max(11, 12 * zoom) }}>{column.label}<span> · {column.count}</span></button>);
  return <div className="sp-col-labels" aria-label="Graph columns">{labels}</div>;
}

function SpatialCanvasInner({ backdrop, timeline, agentCard }: Props) {
  const state = useProject((s) => s.state);
  const selection = useProject((s) => s.selection);
  const store = useProjectStore();
  const router = useRouter();
  const playhead = usePlayheadStore();
  const { fitView, setCenter, zoomIn, zoomOut, getNode } = useReactFlow();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Selected");
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string; sub?: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [compact, setCompact] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [preset, setPreset] = useState("vertical");
  const [language, setLanguage] = useState("en");
  const [translateLang, setTranslateLang] = useState("zu");
  const [panMode, setPanMode] = useState(true);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { id: projectId } = store.getState();
  const plans = useMemo(() => state.plans.map((plan) => ({ planId: plan.id, title: plan.prompt || "Trim proposal", reason: plan.prompt || "AI proposal", preview: [], kind: "action" as const, status: plan.status })), [state.plans]);
  const graph = useMemo(() => buildGraph(state, { languageName: langName, proposals: plans }), [state, plans]);
  const sceneIds = useMemo(() => new Set(graph.nodes.filter((n) => n.kind === "scene").map((n) => n.data.refId)), [graph]);
  const selectedScenes = useMemo(() => selection.filter((id) => sceneIds.has(id)), [selection, sceneIds]);
  const active = graph.nodes.find((n) => n.id === activeId) ?? graph.nodes.find((n) => n.kind === "scene" && n.data.refId === selectedScenes.at(-1)) ?? null;
  const selectedNodeIds = useMemo(() => new Set(graph.nodes.filter((n) => n.kind === "scene" && selectedScenes.includes(n.data.refId)).map((n) => n.id)), [graph, selectedScenes]);
  const lit = useMemo(() => litEdges(graph, activeId ? new Set([activeId, ...selectedNodeIds]) : selectedNodeIds), [graph, activeId, selectedNodeIds]);

  const say = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5000);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const focus = query.get("focus");
    if (!focus) return;
    const nodeId = `scene:${focus}`;
    if (!graph.nodes.some((n) => n.id === nodeId)) return;
    requestAnimationFrame(() => { store.getState().select([focus]); setActiveId(nodeId); const n = getNode(nodeId); if (n) setCenter(n.position.x + 104, n.position.y + 44, { zoom: 1.05, duration: 300 }); });
  // Deep-link is intentionally read once per mounted project view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const change = () => setCompact(media.matches);
    change(); media.addEventListener("change", change); return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { store.getState().clearSelection(); setActiveId(null); setMenu(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  const nodeMenu = useCallback((nodeId: string, at?: { x: number; y: number }) => {
    const x = at ? at.x - 200 : window.innerWidth / 2;
    const y = at ? at.y : 112;
    setMenu({ nodeId, x: Math.max(8, Math.min(window.innerWidth - 220, x)), y: Math.max(8, Math.min(window.innerHeight - 340, y)) });
  }, []);
  const proxyId = state.proxy?.id ?? null;
  const nodes: FlowNode[] = useMemo(() => graph.nodes.map((n) => ({ id: n.id, type: "spatial", position: n.position, width: NODE_W, height: NODE_H, draggable: false, selectable: true, focusable: true, selected: n.kind === "scene" ? selectedScenes.includes(n.data.refId) : activeId === n.id, data: { ...n.data, kind: n.kind, proxyId: (n.kind === "source" || n.kind === "scene") ? proxyId : null, menu: (at: { x: number; y: number }) => nodeMenu(n.id, at) } })), [graph, selectedScenes, activeId, proxyId, nodeMenu]);
  const edges = useMemo(() => graph.edges.map((e) => ({ ...e, type: "spatial", data: { ...e, lit: lit.has(e.id) }, selectable: false, focusable: false })), [graph, lit]);

  const runPerScene = useCallback(async (label: string, action: (clipId: string, signal: AbortSignal) => Promise<unknown>, ids = selectedScenes) => {
    if (!ids.length) return;
    const results = await Promise.allSettled(ids.map((clipId) => store.getState().mutate(`clip:${clipId}`, (signal) => action(clipId, signal))));
    const failed = results.flatMap((r, i) => r.status === "rejected" ? [{ id: ids[i], error: r.reason instanceof Error ? r.reason.message : "Request failed." }] : []);
    if (!failed.length) say(`${results.length} ${label}`);
    else if (failed.some((f) => f.error.includes("Outcome unknown"))) { void store.getState().refresh(); say("Not confirmed. Check Outputs before trying again"); }
    else say(`${results.length - failed.length} of ${results.length} ${label}; ${failed.length} failed: ${failed[0].error}`);
  }, [selectedScenes, store, say]);
  const setClipStatus = useCallback((clipId: string, status: "kept" | "dropped", signal: AbortSignal) => api(`/api/items/clip/${encodeURIComponent(clipId)}`, { method: "PATCH", body: { status }, signal }), []);
  const renderScene = useCallback(async (clipId: string, chosenPreset: string, signal: AbortSignal) => {
    setPendingIds((current) => current.includes(clipId) ? current : [...current, clipId]);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    const relayAbort = () => controller.abort(); signal.addEventListener("abort", relayAbort, { once: true });
    let unknownTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        api(`/api/projects/${encodeURIComponent(projectId)}/outputs`, { method: "POST", body: { clipId, preset: chosenPreset, language, burn: true }, key: newKey(), signal: controller.signal }),
        new Promise<never>((_, reject) => { unknownTimer = setTimeout(() => reject(new Error("__outcome_unknown__")), 25_000); }),
      ]);
    } catch (error) {
      if ((error as Error).message === "__outcome_unknown__" || (error as Error).name === "AbortError") {
        void store.getState().refresh();
        say("Not confirmed. Check Outputs before trying again");
        throw new Error("Outcome unknown · refreshing");
      }
      throw error;
    } finally { clearTimeout(timeout); if (unknownTimer) clearTimeout(unknownTimer); signal.removeEventListener("abort", relayAbort); void store.getState().refresh().finally(() => setPendingIds((current) => current.filter((id) => id !== clipId))); }
  }, [projectId, language, store, say]);
  const requestConsent = useCallback(async (personId: string, scope: "appearance" | "voice" | "likeness") => {
    await store.getState().mutate(`person:${personId}`, (signal) => api(`/api/projects/${encodeURIComponent(projectId)}/consent`, { method: "POST", body: { personId, scope }, signal }));
  }, [projectId, store]);
  const askConsent = useCallback((clipIds: string[], scope: Scope) => {
    const people = [...new Map(clipIds.flatMap((id) => { const c = state.clips.find((x) => x.id === id); return c ? state.people.filter((p) => p.wholeRecording || p.ranges.some((r) => r.endMs > c.startMs && r.startMs < c.endMs)) : []; }).map((p) => [p.id, p])).values()];
    if (!people.length) { say("No people in this scene"); return; }
    void Promise.allSettled(people.map((p) => requestConsent(p.id, scope))).then((results) => { const ok = results.filter((r) => r.status === "fulfilled").length; say(ok === results.length ? `Consent requested from ${ok} ${ok === 1 ? "person" : "people"}` : `${ok} of ${results.length} requests sent`); });
  }, [state.clips, state.people, requestConsent, say]);

  const menus = useMemo(() => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const make = (node: GraphNode): MenuItem[] => {
      const id = node.data.refId;
      const base = `/app/p/${encodeURIComponent(projectId)}`;
      switch (node.kind) {
        case "scene": return [
          { label: "Open in Flat Studio", run: () => { router.push(`${base}?focus=${encodeURIComponent(id)}`); } },
          { label: "Trim with AI", tone: "ai", run: () => { const clip = state.clips.find((c) => c.id === id); askAgent(`Suggest a tighter trim for “${clip?.title ?? "scene"}” (${clip?.startMs ?? 0}–${clip?.endMs ?? 0} ms).`); say("Added to the agent"); } },
          { label: "Render", items: PRESETS.map(([value, label]) => ({ label, run: () => void runPerScene("queued", (clipId, signal) => renderScene(clipId, value, signal), [id]) })) },
          { label: "Keep", run: () => void runPerScene("kept", (clipId, signal) => setClipStatus(clipId, "kept", signal), [id]) },
          { label: "Drop", run: () => void runPerScene("dropped", (clipId, signal) => setClipStatus(clipId, "dropped", signal), [id]) },
          { label: "Request consent", items: SCOPES.map(([scope, label]) => ({ label, run: () => askConsent([id], scope) })) },
          { label: "Copy timecode", run: () => { void navigator.clipboard?.writeText(node.data.meta).then(() => say("Timecode copied")); } },
        ];
        case "output": { const output = state.outputs.find((o) => o.id === id); const assetId = output?.asset?.id; return [
          { label: "Download", disabled: output?.status !== "ready" || !assetId, run: () => { if (assetId) window.open(`/api/media/${encodeURIComponent(assetId)}?download`, "_self"); } },
                    { label: "Open in Outputs", run: () => { router.push(`${base}/publish`); } },
        ]; }
        case "language": return [{ label: "Open in Localise", run: () => { router.push(`${base}/localise`); } }];
        case "person": return [
          { label: "Open in Rights map", run: () => { router.push(`${base}/protect`); } },
          { label: "Show QR", run: () => { router.push(`${base}/protect?person=${encodeURIComponent(id)}`); } },
        ];
        case "offer": return [{ label: "Open in Earn", run: () => { router.push(`${base}/earn`); } }];
        case "proposal": return [
          { label: "Preview range", run: () => { const n = byId.get(`prop:${id}`); if (n?.data.startMs !== undefined && n.data.endMs !== undefined) playhead.getState().playRange(n.data.startMs, n.data.endMs); } },
          { label: "Open in agent panel", run: () => { askAgent(`Review trim proposal ${node.data.title} (${node.data.meta}).`); } },
        ];
        default: return [];
      }
    };
    return menusFor(graph.nodes, make);
  }, [graph, projectId, state, router, runPerScene, renderScene, setClipStatus, askConsent, playhead, say]);

  const openMenu = menu ? menus.get(menu.nodeId) ?? [] : [];
  const activeEdges = active ? graph.edges.filter((e) => e.source === active.id || e.target === active.id) : [];
  const linkedNodes = activeEdges.map((e) => ({ edge: e, node: graph.nodes.find((n) => n.id === (e.source === active?.id ? e.target : e.source)) })).filter((x) => x.node);
  const activeClip = active?.kind === "scene" ? state.clips.find((c) => c.id === active.data.refId) : null;
  const consentPeople = activeClip ? state.people.filter((p) => p.wholeRecording || p.ranges.some((r) => r.endMs > activeClip.startMs && r.startMs < activeClip.endMs)) : [];
  const linkedOutputs = activeClip ? state.outputs.filter((o) => o.clipId === activeClip.id) : [];
  const toastByResult = async (label: string, p: Promise<unknown>) => p.then(() => say(label), (e) => say(e instanceof Error ? e.message : "Action failed."));
  const fitColumn = (label: string) => { const targets = graph.nodes.filter((n) => n.kind === ({ Source: "source", Scenes: "scene", Languages: "language", Outputs: "output" } as Record<string, string>)[label]); if (targets.length) void fitView({ nodes: targets.map((n) => ({ id: n.id })), padding: .35, duration: 250 }); };
  const clickNode = (_event: React.MouseEvent, node: Node<SpatialNodeData>) => { setActiveId(node.id); if (node.data.kind === "scene") store.getState().select([node.data.refId], _event.shiftKey || _event.metaKey || _event.ctrlKey ? "toggle" : "replace"); else if (!_event.metaKey && !_event.ctrlKey && !_event.shiftKey) store.getState().clearSelection(); };
  const selectFlow = (ids: string[]) => {
    const selected = graph.nodes.filter((n) => ids.includes(n.id) && n.kind === "scene").map((n) => n.data.refId);
    const same = selected.length === selectedScenes.length && selected.every((id) => selectedScenes.includes(id));
    if (!same) store.getState().select(selected);
    const last = ids.at(-1);
    if (last && last !== activeId) setActiveId(last);
  };
  const doRender = () => void runPerScene("queued", (clipId, signal) => renderScene(clipId, preset, signal));
  const doTranslate = () => toastByResult("Translation queued", store.getState().mutate("project:translate", (signal) => api(`/api/projects/${encodeURIComponent(projectId)}/run`, { method: "POST", body: { type: "translate", language: translateLang }, signal })));
  const [consentOpen, setConsentOpen] = useState(false);
  const doConsent = (scope: Scope) => { setConsentOpen(false); askConsent(selectedScenes, scope); };
  const graphForPhone = graph.nodes;
  const columns = new Map(graph.columns.map((c) => [c.label, c.count]));
  const staticToggle = (checked: boolean) => { localStorage.setItem("izwi:staticScene", checked ? "1" : "0"); window.dispatchEvent(new Event("izwi:staticscene")); };

  return <main className="spatial" onClick={() => { if (menu) setMenu(null); }}>
    <aside className="sp-tree" aria-label="Project map"><h2>Project map</h2>{["Source", "Scenes", "Languages", "Outputs"].map((label) => <button key={label} type="button" aria-current={false} onClick={() => fitColumn(label)}><span>{label}</span><small>{columns.get(label) ?? 0}</small></button>)}<div className="sp-tree-lower">{["People", "Licence offers", "AI trims"].map((label) => { const kind = label === "People" ? "person" : label === "Licence offers" ? "offer" : "proposal"; return <button key={label} type="button" onClick={() => { const ns = graph.nodes.filter((n) => n.kind === kind); if (ns.length) void fitView({ nodes: ns.map((n) => ({ id: n.id })), padding: .3, duration: 250 }); }}><span>{label}</span><small>{graph.nodes.filter((n) => n.kind === kind).length}</small></button>; })}</div></aside>
    <section className="sp-stage" aria-label="Project graph">
      <div className="sp-backdrop" aria-hidden="true">{backdrop}</div>
      {selectedScenes.length > 0 && <div className="sp-toolbar" role="toolbar" aria-label={`${selectedScenes.length} selected`} onClick={(e) => e.stopPropagation()}><strong>{selectedScenes.length} selected</strong><select aria-label="Render format" value={preset} onChange={(e) => setPreset(e.target.value)}><option value="vertical">Vertical 9:16</option><option value="square">Square 1:1</option><option value="wide">Wide 16:9</option></select><button className="primary" type="button" onClick={doRender}>Render</button><button type="button" onClick={() => void runPerScene("kept", (id, signal) => setClipStatus(id, "kept", signal))}>Keep</button><button type="button" onClick={() => void runPerScene("dropped", (id, signal) => setClipStatus(id, "dropped", signal))}>Drop</button><span className="sp-consent"><button type="button" aria-expanded={consentOpen} onClick={() => setConsentOpen((v) => !v)}>Request consent</button>{consentOpen && <span className="sp-consent-menu" role="menu">{SCOPES.map(([scope, label]) => <button key={scope} type="button" role="menuitem" onClick={() => doConsent(scope)}>{label}</button>)}</span>}</span><button type="button" onClick={() => { const clips = state.clips.filter((c) => selectedScenes.includes(c.id)); askAgent(`Review these selected scenes: ${clips.map((c) => `“${c.title}” (${c.startMs}–${c.endMs} ms)`).join(", ")}.`); say("Added to the agent"); }}>Ask AI</button></div>}
      <div className="sp-project-translate" onClick={(e) => e.stopPropagation()}><select aria-label="Translate project language" value={translateLang} onChange={(e) => setTranslateLang(e.target.value)}><option value="zu">isiZulu</option><option value="xh">isiXhosa</option><option value="af">Afrikaans</option><option value="st">Sesotho</option></select><button type="button" onClick={doTranslate}>Translate project</button></div>
      {!compact && <ReactFlow className="sp-flow" nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable fitView fitViewOptions={{ padding: .18 }} minZoom={.15} maxZoom={1.8} panOnDrag={panMode} selectionOnDrag selectionKeyCode="Shift" multiSelectionKeyCode="Meta" onNodeClick={clickNode} onNodeContextMenu={(event, node) => { event.preventDefault(); setActiveId(node.id); nodeMenu(node.id, { x: event.clientX + 200, y: event.clientY }); }} onSelectionChange={({ nodes: chosen }) => selectFlow(chosen.map((n) => n.id))} onKeyDown={(event) => { const id = (event.target as HTMLElement).closest(".react-flow__node")?.getAttribute("data-id"); const node = graph.nodes.find((candidate) => candidate.id === id); if (!node) return; if (event.key === "Enter") { setActiveId(node.id); setTab("Selected"); } if (event.key === " " && node.kind === "scene") { event.preventDefault(); store.getState().select([node.data.refId], "toggle"); } }} onPaneClick={() => { setMenu(null); }} aria-label="Spatial project graph">
        <CanvasScene graph={graph} onFitColumn={fitColumn} />
      </ReactFlow>}
      {(!state.source || graph.nodes.filter((n) => n.kind === "scene").length === 0) && <div className="sp-empty"><h2>{state.source ? "No scenes yet" : "No recording yet"}</h2><p>{state.source ? "Find highlights to start the story." : "Add a recording to build the project graph."}</p>{state.source && <button type="button" onClick={() => toastByResult("Highlights queued", store.getState().mutate("project:suggest", (signal) => api(`/api/projects/${encodeURIComponent(projectId)}/run`, { method: "POST", body: { type: "suggest_clips", count: 3 }, signal })))}>Find highlights</button>}</div>}
      <div className="sp-controls" role="toolbar" aria-label="Canvas controls"><button type="button" aria-pressed={panMode} onClick={() => setPanMode((value) => !value)}>{panMode ? "Pan" : "Select"}</button><button type="button" aria-label="Zoom in" onClick={() => void zoomIn()}><Plus size={17} /></button><button type="button" aria-label="Zoom out" onClick={() => void zoomOut()}><Minus size={17} /></button><button type="button" onClick={() => void fitView({ padding: .18, duration: 250 })}>Fit</button><label className="sp-static"><input type="checkbox" defaultChecked={typeof window !== "undefined" && localStorage.getItem("izwi:staticScene") === "1"} onChange={(e) => staticToggle(e.target.checked)} />Static scene</label></div>
    </section>
    <aside className="sp-inspector" aria-label="Inspector"><h2>Inspector</h2><div role="tablist" aria-label="Inspector"><button role="tab" aria-selected={tab === "Selected"} onClick={() => setTab("Selected")}>Selected</button><button role="tab" aria-selected={tab === "Links"} onClick={() => setTab("Links")}>Links</button><button role="tab" aria-selected={tab === "AI"} onClick={() => setTab("AI")}>AI</button></div>{tab === "AI" ? agentCard : tab === "Links" ? <>{linkedNodes.length ? <ul className="sp-links">{linkedNodes.map(({ edge, node }) => <li key={edge.id}>{edge.kind === "consent" ? "Consent for" : edge.kind === "offer" ? "Licence offer for" : edge.kind === "proposal" ? "Trim proposal for" : "Connected to"} {node!.data.title} · {edge.dashed ? "pending" : edge.tone === "held" ? "held" : "linked"}</li>)}</ul> : <div className="sp-fact"><span>Select a node to see its links.</span></div>}</> : active ? <>
      <div className="sp-preview">{active.kind === "scene" ? <><Frame proxyId={state.proxy?.id} ms={active.data.startMs} className="sp-preview-image" /><button aria-label="Play scene range" title="Play scene range" onClick={() => { if (active.data.startMs !== undefined && active.data.endMs !== undefined) playhead.getState().playRange(active.data.startMs, active.data.endMs); }}><Play size={19} weight="fill" /></button></> : <span>{active.data.state}</span>}</div>
      <h3>{active.data.title}</h3><div className="sp-fact"><b>Type</b><span>{active.kind}</span></div><div className="sp-fact"><b>State</b><span>{active.data.state}</span></div><div className="sp-fact"><b>Source</b><span>{state.source?.filename ?? "No recording"}</span></div>{active.data.startMs !== undefined && active.data.endMs !== undefined && <div className="sp-fact"><b>Range · duration</b><span>{active.data.meta} · {((active.data.endMs - active.data.startMs) / 1000).toFixed(1)} s</span></div>}{activeClip && <><div className="sp-fact"><b>Consent</b><span>{consentPeople.length ? consentPeople.map((p) => `${p.name}: ${p.consent?.status ?? "not asked"}`).join(" · ") : "No linked people"}</span></div><div className="sp-fact"><b>Outputs</b><span>{linkedOutputs.length ? linkedOutputs.map((o) => o.status).join(" · ") : "No outputs"}</span></div>{trimBlocked({ outputs: state.outputs.map((o) => ({ clipId: o.clipId, status: o.status })), readOnly: store.getState().readOnly }, activeClip.id, pendingIds) && <div className="sp-fact"><b>Trim status</b><span>{trimBlocked({ outputs: state.outputs.map((o) => ({ clipId: o.clipId, status: o.status })), readOnly: store.getState().readOnly }, activeClip.id, pendingIds)}</span></div>}</>}
      </> : <div className="sp-fact"><span>Select a scene or project object.</span></div>}</aside>
    <div className="sp-timeline">{timeline}</div>
    {menu && <div className="sp-context" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>{menu.sub && <button type="button" role="menuitem" className="sp-menu-back" onClick={() => setMenu({ ...menu, sub: undefined })}><CaretLeft size={14} aria-hidden="true" />{menu.sub}</button>}{(menu.sub ? openMenu.find((i) => i.label === menu.sub)?.items ?? [] : openMenu).map((item) => <button type="button" role="menuitem" key={item.label} disabled={item.disabled} aria-haspopup={item.items ? "menu" : undefined} onClick={() => { if (item.items) { setMenu({ ...menu, sub: item.label }); return; } setMenu(null); item.run?.(); }}>{item.label}{item.items && <span aria-hidden="true" className="sp-menu-more">›</span>}</button>)}<div className="sp-menu-status">{graph.nodes.find((n) => n.id === menu.nodeId)?.data.state}</div></div>}
    {notice && <div className="sp-notice" role="status">{notice}</div>}
    <section className="sp-phone" aria-label="Project story chain">
      <div className="sp-project-translate sp-phone-translate"><select aria-label="Translate project language" value={translateLang} onChange={(e) => setTranslateLang(e.target.value)}><option value="zu">isiZulu</option><option value="xh">isiXhosa</option><option value="af">Afrikaans</option><option value="st">Sesotho</option></select><button type="button" onClick={doTranslate}>Translate project</button></div>
      {selectedScenes.length > 0 && <div className="sp-toolbar" role="toolbar" aria-label={`${selectedScenes.length} selected`}><strong>{selectedScenes.length} selected</strong><button type="button" onClick={doRender}>Render</button><button type="button" onClick={() => void runPerScene("kept", (id, signal) => setClipStatus(id, "kept", signal))}>Keep</button><button type="button" onClick={() => void runPerScene("dropped", (id, signal) => setClipStatus(id, "dropped", signal))}>Drop</button><span className="sp-consent"><button type="button" aria-expanded={consentOpen} onClick={() => setConsentOpen((v) => !v)}>Request consent</button>{consentOpen && <span className="sp-consent-menu" role="menu">{SCOPES.map(([scope, label]) => <button key={scope} type="button" role="menuitem" onClick={() => doConsent(scope)}>{label}</button>)}</span>}</span><button type="button" onClick={() => { const clips = state.clips.filter((c) => selectedScenes.includes(c.id)); askAgent(`Review these selected scenes: ${clips.map((c) => `“${c.title}” (${c.startMs}–${c.endMs} ms)`).join(", ")}.`); say("Added to the agent"); }}>Ask AI</button></div>}
      {!state.source || graphForPhone.filter((n) => n.kind === "scene").length === 0 ? <div className="sp-phone-empty"><h2>{state.source ? "No scenes yet" : "No recording yet"}</h2><p>{state.source ? "Find highlights to start the story." : "Add a recording to build the project graph."}</p>{state.source && <button onClick={() => toastByResult("Highlights queued", store.getState().mutate("project:suggest", (signal) => api(`/api/projects/${encodeURIComponent(projectId)}/run`, { method: "POST", body: { type: "suggest_clips", count: 3 }, signal })))}>Find highlights</button>}</div> : <>{[["Source", "source"], ["Scenes", "scene"], ["Languages", "language"], ["Outputs", "output"], ["People", "person"], ["Licence offers", "offer"], ["AI trims", "proposal"]].map(([label, kind]) => { const rows = graphForPhone.filter((n) => n.kind === kind); if (!rows.length) return null; return <section key={label}><h2>{label}</h2>{rows.map((n) => <div className="sp-phone-row" key={n.id}><button type="button" className="sp-phone-card" aria-pressed={n.kind === "scene" ? selectedScenes.includes(n.data.refId) : activeId === n.id} onClick={() => { setActiveId(n.id); if (n.kind === "scene") store.getState().select([n.data.refId], "toggle"); }} onContextMenu={(e) => { e.preventDefault(); setActiveId(n.id); nodeMenu(n.id, { x: e.clientX + 200, y: e.clientY }); }}><Frame proxyId={(n.kind === "scene" || n.kind === "source") ? state.proxy?.id : null} ms={n.data.startMs} /><span className="sp-node-copy"><span className="sp-node-title">{n.data.title}</span><span className="sp-node-meta">{n.data.meta}</span><span className="sp-pill" data-tone={n.data.tone}>{n.data.state}</span></span></button><button className="sp-phone-menu" aria-label={`More actions for ${n.data.title}`} onClick={(e) => { setActiveId(n.id); const r = e.currentTarget.getBoundingClientRect(); nodeMenu(n.id, { x: r.right, y: r.bottom + 4 }); }}><DotsThree size={22} /></button></div>)}</section>; })}</>}
    </section>
  </main>;
}

function menusFor(graphNodes: GraphNode[], make: (node: GraphNode) => MenuItem[]) { return new Map(graphNodes.map((node) => [node.id, make(node)])); }

export function SpatialCanvas(props: Props) {
  return <ReactFlowProvider><SpatialCanvasInner {...props} /></ReactFlowProvider>;
}
