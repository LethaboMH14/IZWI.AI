"use client";

import "@/app/timeline.css";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { DotsThree, Pause, Play, Sparkle } from "@phosphor-icons/react";
import { ContextMenu, DropdownMenu, Slider, Timecode, Tooltip, type MenuItem } from "@/components/z";
import { usePlayhead, usePlayheadStore, useProject, useProjectStore } from "@/components/workspace/ProjectProvider";
import { api } from "@/lib/api";
import { stripTimes, useFrame } from "@/lib/frames";
import { clampTrim, envelopeSlice, msToPx, pxToMs, stackClips, trimBlocked, viewportRange, visibleWindow } from "@/lib/timeline-math";
import { formatTime } from "@/lib/timecode";
import { useTimelineRenders } from "./useTimelineRenders";

// This timeline owns one shared scroll and time scale. wavesurfer.js owns its own scroll container, and
// @xzdarcy/react-timeline-editor cannot share this project's one-scale lane model without fighting it.

type Clip = ReturnType<typeof useProject> extends never ? never : {
  id: string; title: string; startMs: number; endMs: number; status: string; gate: { ok: boolean; [key: string]: unknown };
  updatedAt?: number; // sent back as expectUpdatedAt (ui-contracts C)
};
type Caption = { id: string; startMs: number; endMs: number; text: string; status?: string };
type DragRange = { id: string; startMs: number; endMs: number };
const LABEL_W = 96;
const MIN_ZOOM = 0.0001;
const MAX_ZOOM = 0.2;

function FrameThumb({ proxyId, ms, left, width }: { proxyId: string; ms: number; left: number; width: number }) {
  const url = useFrame(proxyId, ms);
  return <span className="tl-frame" style={{ left, width }}>{url && <img src={url} alt="" draggable={false} />}</span>; // eslint-disable-line @next/next/no-img-element -- blob frame URL
}

function ownsShortcut(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(
    "button, [role=menu], [role=menuitem], [role=slider], input, textarea, select, [contenteditable]",
  );
}

function PlayheadDisplay({ duration, zoom }: { duration: number; zoom?: number }) {
  const ms = usePlayhead((state) => state.ms);
  if (zoom === undefined) {
    return <span className="tl-readout"><Timecode ms={ms} /> <span>/</span> <Timecode ms={duration} /></span>;
  }
  return <div className="tl-playhead" aria-hidden="true" style={{ left: LABEL_W + msToPx(Math.min(duration, ms), zoom) }}><span>{formatTime(ms)}</span></div>;
}

function CaptionBlock({ caption, kind, zoom }: { caption: Caption; kind: "source" | "translation"; zoom: number }) {
  const current = usePlayhead(({ ms }) => ms >= caption.startMs && ms <= caption.endMs);
  const style = { left: msToPx(caption.startMs, zoom), width: Math.max(16, msToPx(caption.endMs - caption.startMs, zoom)) };
  const state = kind === "source" ? "source" : caption.status === "approved" ? "approved" : "draft";
  return <div className={`tl-caption is-${state}${current ? " is-current" : ""}`} title={caption.text} style={style}><span>{caption.text}</span></div>;
}

function Ruler({ duration, zoom, ticks, seek }: {
  duration: number; zoom: number; ticks: number[]; seek: (clientX: number) => void;
}) {
  const ms = usePlayhead((state) => Math.round(state.ms));
  const playheadStore = usePlayheadStore();
  const pointer = useRef<number | null>(null);
  return <div className="tl-ruler" role="slider" aria-label="Playhead position" aria-valuemin={0}
    aria-valuemax={duration} aria-valuenow={ms} aria-valuetext={formatTime(ms)} tabIndex={0}
    onKeyDown={(event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const step = (event.shiftKey ? 5000 : 1000) * (event.key === "ArrowLeft" ? -1 : 1);
      const playhead = playheadStore.getState();
      playhead.seekTo(Math.min(duration, Math.max(0, playhead.ms + step)));
    }}
    onPointerDown={(event) => {
      pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      seek(event.clientX);
    }}
    onPointerMove={(event) => { if (pointer.current === event.pointerId) seek(event.clientX); }}
    onPointerUp={(event) => {
      if (pointer.current !== event.pointerId) return;
      pointer.current = null;
      seek(event.clientX);
    }}
    onPointerCancel={() => { pointer.current = null; }}>
    {ticks.map((tick) => <span key={tick} className="tl-tick" style={{ left: msToPx(tick, zoom) }}><i />{formatTime(tick)}</span>)}
  </div>;
}

export function Timeline({ compact = false, onAskAI }: { compact?: boolean; onAskAI?: (clipIds: string[]) => void }) {
  const project = useProject((s) => s.state);
  const selection = useProject((s) => s.selection);
  const readOnly = useProject((s) => s.readOnly);
  const tracksCache = useProject((s) => s.tracks);
  const projectStore = useProjectStore();
  const playheadStore = usePlayheadStore();
  const playing = usePlayhead((s) => s.playing);
  const router = useRouter();
  const timelineRef = useRef<HTMLElement>(null);
  const hovered = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledAt = useRef(0);
  const programmaticScrollUntil = useRef(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const [zoom, setZoom] = useState(0.06);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [windowMs, setWindowMs] = useState({ start: 0, end: Number.MAX_SAFE_INTEGER });
  const [draft, setDraft] = useState<DragRange | null>(null);
  const [markers, setMarkers] = useState<{ inMs: number | null; outMs: number | null }>({ inMs: null, outMs: null });
  const [notice, setNotice] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const { rendering, pendingRenders, pendingRef, renderNotice, renderTargets } = useTimelineRenders(projectStore);

  const duration = Math.max(0, project.source?.durationMs ?? project.proxy?.durationMs ?? 0);
  const sourceClips = (project.clips as unknown as Clip[]).filter((clip) => clip.status !== "dropped");
  const sortedClips = [...sourceClips].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  const numbered = new Map(sortedClips.map((clip, index) => [clip.id, index + 1]));
  const selectedClips = sortedClips.filter((clip) => selection.includes(clip.id));
  const firstTranslation = project.tracks.find((track) => track.kind === "translation");
  const translationTracks = useMemo(() => compact
    ? (firstTranslation ? [firstTranslation] : [])
    : project.tracks.filter((track) => track.kind === "translation"), [compact, firstTranslation, project.tracks]);
  const hasVideo = !!project.proxy?.id;
  const showVideo = hasVideo || sourceClips.length > 0;
  const showAudio = project.peaks.length > 0;
  const lanes = useMemo(() => {
    const items: Array<{ key: string; label: string; kind: "video" | "audio" | "source" | "translation"; trackId?: string }> = [];
    if (showVideo) items.push({ key: "video", label: "V1  Video", kind: "video" });
    if (!compact && showAudio) items.push({ key: "audio", label: "A1  Dialogue", kind: "audio" });
    if (project.lines.length) items.push({ key: "source", label: "C1  Captions", kind: "source" });
    translationTracks.forEach((track, index) => items.push({ key: track.id, label: `C${index + 2}  ${track.language}`, kind: "translation", trackId: track.id }));
    return items;
  }, [compact, project.lines.length, showAudio, showVideo, translationTracks]);

  useEffect(() => {
    for (const track of translationTracks) void projectStore.getState().loadTrack(track.id);
  }, [projectStore, translationTracks]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      setViewportWidth(width);
      const range = viewportRange(element.scrollLeft, width, LABEL_W, zoom, 1000);
      setWindowMs({ start: range.start, end: Math.min(duration, range.end) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [duration, zoom, lanes.length]);

  useEffect(() => {
    const follow = ({ ms, playing }: ReturnType<typeof playheadStore.getState>) => {
      if (!playing || !duration || Date.now() - userScrolledAt.current < 4000) return;
      const element = scrollRef.current;
      if (!element) return;
      const x = LABEL_W + msToPx(ms, zoom);
      const left = element.scrollLeft;
      const right = left + element.clientWidth;
      if (x > right - 60 || x < left + LABEL_W) {
        const next = Math.min(element.scrollWidth - element.clientWidth, Math.max(0, x - element.clientWidth * 0.65));
        if (Math.abs(next - left) < 1) return;
        programmaticScrollUntil.current = Date.now() + 500;
        element.scrollTo({ left: next, behavior: "auto" });
      }
    };
    follow(playheadStore.getState());
    return playheadStore.subscribe((state, previous) => {
      if (state.ms !== previous.ms || state.playing !== previous.playing) follow(state);
    });
  }, [duration, playheadStore, zoom]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || ownsShortcut(event.target)) return;
      if (!hovered.current && !timelineRef.current?.contains(document.activeElement)) return;
      const playhead = playheadStore.getState();
      switch (event.key.toLowerCase()) {
        case "escape": projectStore.getState().clearSelection(); break;
        case " ": playhead.togglePlay(); break;
        case "arrowleft":
        case "arrowright": {
          const step = (event.shiftKey ? 5000 : 1000) * (event.key === "ArrowLeft" ? -1 : 1);
          playhead.seekTo(Math.min(duration, Math.max(0, playhead.ms + step)));
          break;
        }
        case "i": setMarkers((old) => ({ ...old, inMs: Math.round(playhead.ms) })); break;
        case "o": setMarkers((old) => ({ ...old, outMs: Math.round(playhead.ms) })); break;
        default: return;
      }
      event.preventDefault();
    };
    // React controls handle the key first. Flat Studio's window listener sees defaultPrevented.
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [duration, playheadStore, projectStore]);

  useEffect(() => projectStore.subscribe((state, previous) => {
    if (state.selection !== previous.selection) setDraft(null);
    else if (state.state.clips !== previous.state.clips) {
      setDraft((edit) => {
        if (!edit) return edit;
        const before = previous.state.clips.find((clip) => clip.id === edit.id);
        const after = state.state.clips.find((clip) => clip.id === edit.id && clip.status !== "dropped");
        return before?.startMs === after?.startMs && before?.endMs === after?.endMs && after ? edit : null;
      });
    }
  }), [projectStore]);

  const clipRange = useCallback((clip: Clip): DragRange => draft?.id === clip.id ? draft : { id: clip.id, startMs: clip.startMs, endMs: clip.endMs }, [draft]);
  const blockedReason = useCallback((clip: Clip) => trimBlocked({ outputs: project.outputs, readOnly }, clip.id, pendingRenders), [pendingRenders, project.outputs, readOnly]);
  const msAt = useCallback((clientX: number) => {
    const element = scrollRef.current;
    const rect = element?.getBoundingClientRect();
    return rect && element ? Math.min(duration, Math.max(0, pxToMs(clientX - rect.left + element.scrollLeft - LABEL_W, zoom))) : 0;
  }, [duration, zoom]);
  const commitTrim = useCallback(async (next: DragRange) => {
    const current = projectStore.getState();
    const clip = current.state.clips.find((item) => item.id === next.id && item.status !== "dropped");
    const reason = trimBlocked({ outputs: current.state.outputs, readOnly: current.readOnly }, next.id, pendingRef.current.keys());
    if (!clip || reason) { setDraft(null); return; }
    const range = { startMs: Math.round(next.startMs), endMs: Math.round(next.endMs) };
    setDraft(null);
    if (range.startMs === clip.startMs && range.endMs === clip.endMs) return;
    try {
      // expectUpdatedAt: the server refuses (409) if the clip changed since this view loaded it (ui-contracts C).
      await projectStore.getState().mutate(`clip:${clip.id}`, (signal) => api(`/api/items/clip/${encodeURIComponent(clip.id)}`, { method: "PATCH", body: { ...range, expectUpdatedAt: clip.updatedAt }, signal }));
    } catch (error) { setNotice(error instanceof Error ? error.message : "The trim could not be saved."); }
  }, [pendingRef, projectStore]);

  const selectClip = useCallback((event: ReactMouseEvent, clip: Clip) => {
    if (longPressed.current && event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === "touch") {
      longPressed.current = false;
      return;
    }
    const mode = event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace";
    projectStore.getState().select([clip.id], mode);
  }, [projectStore]);
  const onTouchStart = (clip: Clip) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (resetPressTimer.current) clearTimeout(resetPressTimer.current);
    longPressed.current = false;
    pressTimer.current = setTimeout(() => { longPressed.current = true; projectStore.getState().select([clip.id], "replace"); }, 500);
  };
  const stopTouchPress = (event: ReactPointerEvent) => {
    if (event.pointerType !== "touch") return;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    if (resetPressTimer.current) clearTimeout(resetPressTimer.current);
    resetPressTimer.current = setTimeout(() => { longPressed.current = false; }, 50);
  };
  useEffect(() => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (resetPressTimer.current) clearTimeout(resetPressTimer.current);
  }, []);
  const selectionIds = selectedClips.map((clip) => clip.id);
  const selectionStart = selectedClips.length ? Math.min(...selectedClips.map((clip) => clip.startMs)) : null;
  const selectionEnd = selectedClips.length ? Math.max(...selectedClips.map((clip) => clip.endMs)) : null;

  const setEdgeToPlayhead = async (clip: Clip, edge: "start" | "end") => {
    if (blockedReason(clip)) return;
    const requested = playheadStore.getState().ms;
    const range = clampTrim(clip, edge, requested, duration, 1000, 0);
    const applied = edge === "start" ? range.startMs : range.endMs;
    if (applied !== requested) setNotice(`Clamped to ${formatTime(applied, { tenths: true })}`);
    await commitTrim({ id: clip.id, ...range });
  };

  const actionItems = (clip: Clip): MenuItem[] => {
    const targets = selection.includes(clip.id) && selectionIds.length ? selectedClips : [clip];
    const safety = targets.map(blockedReason).find(Boolean) ?? null;
    const base: MenuItem[] = [
      { heading: `Scene ${numbered.get(clip.id) ?? 1} · ${formatTime(clip.startMs)} – ${formatTime(clip.endMs)}` },
    ];
    if (onAskAI) base.push({ id: "ask-ai", label: "Trim with AI…", icon: Sparkle, onSelect: () => onAskAI(targets.map((item) => item.id)) });
    base.push(
      { id: "keep", label: "Keep", disabled: readOnly.value, disabledReason: readOnly.reason ?? undefined, onSelect: () => void updateStatuses(targets, "kept") },
      { id: "drop", label: "Drop", danger: true, disabled: readOnly.value, disabledReason: readOnly.reason ?? undefined, onSelect: () => void updateStatuses(targets, "dropped") },
      { id: "render", label: "Render", items: ["Vertical 9:16", "Square 1:1", "Wide 16:9"].map((label, index) => ({ id: `render-${index}`, label, disabled: readOnly.value || rendering || targets.some(({ id }) => pendingRenders.has(id)), disabledReason: readOnly.reason ?? undefined, onSelect: () => void renderTargets(targets, (["vertical", "square", "wide"] as const)[index]) })) },
      { separator: true },
      { id: "set-start", label: "Set start to playhead", disabled: !!safety || readOnly.value, disabledReason: safety ?? readOnly.reason ?? undefined, onSelect: () => void Promise.all(targets.map((item) => setEdgeToPlayhead(item, "start"))) },
      { id: "set-end", label: "Set end to playhead", disabled: !!safety || readOnly.value, disabledReason: safety ?? readOnly.reason ?? undefined, onSelect: () => void Promise.all(targets.map((item) => setEdgeToPlayhead(item, "end"))) },
      { id: "spatial", label: "Open in Spatial Canvas", onSelect: () => router.push(`/app/p/${encodeURIComponent(project.project.id)}/spatial?focus=${encodeURIComponent(clip.id)}`) },
      { id: "copy", label: "Copy timecode", onSelect: () => void copyTimecode(targets) },
    );
    return base;
  };

  const updateStatuses = async (targets: Clip[], status: "kept" | "dropped") => {
    const results = await Promise.allSettled(targets.map((clip) => projectStore.getState().mutate(`clip:${clip.id}`, (signal) => api(`/api/items/clip/${encodeURIComponent(clip.id)}`, { method: "PATCH", body: { status, expectUpdatedAt: clip.updatedAt }, signal }))));
    const failed = results.filter((result) => result.status === "rejected");
    setNotice(failed.length ? `${failed.length} failed: ${(failed[0] as PromiseRejectedResult).reason instanceof Error ? (failed[0] as PromiseRejectedResult).reason.message : "request failed"}` : `${targets.length} scene${targets.length === 1 ? "" : "s"} ${status === "kept" ? "kept" : "dropped"}`);
  };

  const copyTimecode = async (targets: Clip[]) => {
    const start = Math.min(...targets.map((item) => item.startMs));
    const end = Math.max(...targets.map((item) => item.endMs));
    try { await navigator.clipboard.writeText(`${formatTime(start)} – ${formatTime(end)}`); setCopyNotice("Timecode copied"); }
    catch { setCopyNotice("Copy is unavailable in this browser"); }
  };

  const allStacked = stackClips(sourceClips.map((clip) => ({ id: clip.id, startMs: draft?.id === clip.id ? draft.startMs : clip.startMs, endMs: draft?.id === clip.id ? draft.endMs : clip.endMs })));
  const maxRows = Math.max(1, ...allStacked.map((clip) => clip.row + 1));
  const contentWidth = Math.max(Math.max(0, viewportWidth - LABEL_W), msToPx(duration, zoom));
  const frameTimes = hasVideo && duration > 0 ? stripTimes(duration, Math.min(60, Math.max(1, Math.ceil(duration / 5000)))) : [];
  const ticks = duration > 0 ? Array.from({ length: 6 }, (_, i) => Math.round((duration * i) / 5)) : [0];
  const block = blockedReason;

  return (
    <section className={`tl${compact ? " tl-compact" : ""}`} aria-label="Timeline" ref={timelineRef}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") hovered.current = true; }}
      onPointerLeave={() => { hovered.current = false; }}>
      <div className="tl-toolbar">
        <button type="button" className="tl-icon-button tl-play" aria-label={playing ? "Pause" : "Play"} onClick={() => playheadStore.getState().togglePlay()}><span aria-hidden="true">{playing ? <Pause weight="fill" /> : <Play weight="fill" />}</span></button>
        <PlayheadDisplay duration={duration} />
        <div className="tl-tools" aria-label="Timeline tools">
          <button type="button" className="tl-small-button" onClick={() => setMarkers((old) => ({ ...old, inMs: Math.round(playheadStore.getState().ms) }))}>In <kbd>I</kbd></button>
          <button type="button" className="tl-small-button" onClick={() => setMarkers((old) => ({ ...old, outMs: Math.round(playheadStore.getState().ms) }))}>Out <kbd>O</kbd></button>
        </div>
        {!compact && <div className="tl-zoom"><span>Zoom</span><Slider label="Timeline zoom" value={zoom} min={MIN_ZOOM} max={MAX_ZOOM} step={0.0001} onValueChange={setZoom} format={(value) => `${(value * 1000).toFixed(1)} px per second`} /><button type="button" className="tl-small-button" onClick={() => { const available = Math.max(100, (scrollRef.current?.clientWidth ?? viewportWidth) - LABEL_W); setZoom(duration ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, available / duration)) : MAX_ZOOM); programmaticScrollUntil.current = Date.now() + 500; scrollRef.current?.scrollTo({ left: 0, behavior: "auto" }); }}>Fit</button></div>}
      </div>
      <div className="tl-scroll" ref={scrollRef} onScroll={(event) => {
        if (Date.now() >= programmaticScrollUntil.current) userScrolledAt.current = Date.now();
        const el = event.currentTarget;
        const range = viewportRange(el.scrollLeft, el.clientWidth, LABEL_W, zoom, 1000);
        setWindowMs({ start: range.start, end: Math.min(duration, range.end) });
      }}>
        <div className="tl-content" style={{ width: LABEL_W + contentWidth, minWidth: LABEL_W + contentWidth }}>
          <div className="tl-ruler-row">
            <span className="tl-ruler-spacer" />
            <Ruler duration={duration} zoom={zoom} ticks={ticks} seek={(clientX) => { if (duration) playheadStore.getState().seekTo(msAt(clientX)); }} />
          </div>
          {lanes.map((lane) => { // eslint-disable-line react-hooks/refs -- lane content only reads refs in user event handlers
            const laneHeight = lane.kind === "video" ? Math.max(34, maxRows * (compact ? 23 : 28)) : compact ? 34 : 40;
            const cache = lane.trackId ? tracksCache[lane.trackId] : undefined;
            let captions: Caption[] = [];
            if (lane.kind === "source") captions = project.lines as Caption[];
            if (lane.kind === "translation" && cache?.status === "ready") captions = cache.lines as Caption[];
            const shownCaptions = visibleWindow(captions, windowMs.start, windowMs.end);
            const audioStart = Math.floor((windowMs.start / Math.max(1, duration)) * project.peaks.length);
            const audio = lane.kind === "audio" ? envelopeSlice(project.peaks, { startMs: windowMs.start, endMs: windowMs.end }, duration) : [];
            const audioOrigin = project.peaks.length ? audioStart / project.peaks.length * duration : 0;
            const stacked = lane.kind === "video" ? allStacked : [];
            return <div className={`tl-lane tl-lane-${lane.kind}`} key={lane.key} style={{ minHeight: laneHeight }}>
              <div className="tl-lane-label"><span>{lane.label.slice(0, 2)}</span><strong>{lane.label.slice(4)}</strong></div>
              <div className="tl-lane-body" style={{ width: contentWidth, minHeight: laneHeight }}>
                {lane.kind === "video" && <>
                  {frameTimes.map((time) => <FrameThumb key={time} proxyId={project.proxy!.id} ms={time} left={msToPx(time - duration / frameTimes.length / 2, zoom)} width={Math.max(4, contentWidth / frameTimes.length)} />)}
                  {!hasVideo && <span className="tl-plain-lane" aria-hidden="true" />}
                  {stacked.map((position) => {
                    const clip = sourceClips.find((item) => item.id === position.id)!;
                    const activeRange = clipRange(clip);
                    const selected = selection.includes(clip.id);
                    const held = !clip.gate?.ok;
                    const left = msToPx(activeRange.startMs, zoom);
                    const width = Math.max(12, msToPx(activeRange.endMs - activeRange.startMs, zoom));
                    const reason = blockedReason(clip);
                    const menu = actionItems(clip);
                    return <ContextMenu key={clip.id} items={menu}>
                      <div className={`tl-clip${clip.status === "kept" ? " is-kept" : " is-suggested"}${selected ? " is-selected" : ""}${held ? " is-held" : ""}`} style={{ left, width, top: 3 + position.row * (compact ? 23 : 28), height: compact ? 20 : 24 }} role="button" tabIndex={0} aria-label={`Scene ${numbered.get(clip.id)}: ${clip.title}, ${formatTime(activeRange.startMs)} to ${formatTime(activeRange.endMs)}${held ? ", held" : ""}`} aria-pressed={selected}
                        onClick={(event) => selectClip(event, clip)} onKeyDown={(event) => { if (event.target === event.currentTarget && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); projectStore.getState().select([clip.id], "replace"); } }} onPointerDown={(event) => { if (event.pointerType === "touch") onTouchStart(clip); }} onPointerUp={stopTouchPress} onPointerCancel={stopTouchPress} onContextMenu={() => { if (!selection.includes(clip.id)) projectStore.getState().select([clip.id], "replace"); }}>
                        <span className="tl-clip-name">{clip.title || `Scene ${numbered.get(clip.id)}`}</span>
                        {held && <span className="tl-held-label">Held</span>}
                        {selected && <DropdownMenu align="end" items={menu} trigger={<button type="button" className="tl-more" aria-label={`Scene ${numbered.get(clip.id)} actions`} onClick={(event) => event.stopPropagation()}><DotsThree size={18} weight="bold" /></button>} />}
                        {selected && <Fragment key={JSON.stringify(selection)}>
                          <TrimHandle edge="start" clip={clip} range={activeRange} duration={duration} zoom={zoom} disabled={!!reason || readOnly.value} reason={reason ?? readOnly.reason} position="start" onBegin={() => setDraft(activeRange)} onChange={(value) => { setDraft(value); playheadStore.getState().seekTo(value.startMs); }} onCommit={commitTrim} onCancel={() => setDraft(null)} />
                          <TrimHandle edge="end" clip={clip} range={activeRange} duration={duration} zoom={zoom} disabled={!!reason || readOnly.value} reason={reason ?? readOnly.reason} position="end" onBegin={() => setDraft(activeRange)} onChange={(value) => { setDraft(value); playheadStore.getState().seekTo(value.endMs); }} onCommit={commitTrim} onCancel={() => setDraft(null)} />
                        </Fragment>}
                      </div>
                    </ContextMenu>;
                  })}
                </>}
                {lane.kind === "audio" && <div className="tl-envelope" aria-label="Recording envelope">
                  {audio.map((value, index) => {
                    const x = msToPx(audioOrigin + ((audioStart + index + 0.5) / project.peaks.length) * duration - audioOrigin, zoom);
                    const bucketW = Math.max(1, msToPx(duration / project.peaks.length, zoom));
                    return <i key={`${audioStart}:${index}`} style={{ left: x, width: Math.min(3, bucketW), height: `${Math.max(2, Math.min(1, Math.max(0, value)) * 28)}px` }} />;
                  })}
                </div>}
                {(lane.kind === "source" || lane.kind === "translation") && <>
                  {lane.kind === "translation" && cache?.status === "loading" && <span className="tl-lane-state">Loading translation…</span>}
                  {lane.kind === "translation" && cache?.status === "error" && <span className="tl-lane-state">Unavailable · {cache.error || "Track could not be loaded"}</span>}
                  {lane.kind === "translation" && !cache && <span className="tl-lane-state">Loading translation…</span>}
                  {shownCaptions.map((caption) => <CaptionBlock key={caption.id} caption={caption} kind={lane.kind === "source" ? "source" : "translation"} zoom={zoom} />)}
                </>}
              </div>
            </div>;
          })}
          <PlayheadDisplay duration={duration} zoom={zoom} />
          {markers.inMs != null && <div className="tl-marker tl-marker-in" style={{ left: LABEL_W + msToPx(markers.inMs, zoom) }} aria-label={`In point ${formatTime(markers.inMs)}`} />}
          {markers.outMs != null && <div className="tl-marker tl-marker-out" style={{ left: LABEL_W + msToPx(markers.outMs, zoom) }} aria-label={`Out point ${formatTime(markers.outMs)}`} />}
        </div>
      </div>
      <div className="tl-status">
        <span>{selectionStart == null || selectionEnd == null ? "No scene selected" : <>{selectionIds.length} scene{selectionIds.length === 1 ? "" : "s"} selected · <Timecode ms={selectionStart} /> – <Timecode ms={selectionEnd} /> ({Math.round((selectionEnd - selectionStart) / 1000)}s)</>}</span>
        {!compact && firstTranslation && <span>{firstTranslation.language} · draft, {firstTranslation.approved}/{firstTranslation.lines} approved</span>}
        <span role="status" aria-live="polite">{notice || copyNotice}</span>
        <span role="status" aria-live="polite">{renderNotice}</span>
      </div>
      {lanes.length === 0 && <p className="tl-empty">No timeline media or captions are available for this project yet.</p>}
    </section>
  );
}

function TrimHandle({ edge, clip, range, duration, zoom, disabled, reason, position, onBegin, onChange, onCommit, onCancel }: {
  edge: "start" | "end"; clip: Clip; range: DragRange; duration: number; zoom: number; disabled: boolean; reason?: string | null; position: "start" | "end";
  onBegin: () => void; onChange: (next: DragRange) => void; onCommit: (next: DragRange) => void | Promise<void>; onCancel: () => void;
}) {
  const active = edge === "start" ? range.startMs : range.endMs;
  const captured = useRef<{ pointerId: number; clientX: number; value: number } | null>(null);
  useEffect(() => { captured.current = null; }, [clip.startMs, clip.endMs, disabled]);
  const cancel = () => {
    captured.current = null;
    onCancel();
  };
  const update = (ms: number) => onChange({ id: clip.id, ...clampTrim(range, edge, ms, duration, 1000, 100) });
  const pointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled) return;
    event.preventDefault(); event.stopPropagation();
    captured.current = { pointerId: event.pointerId, clientX: event.clientX, value: active };
    event.currentTarget.setPointerCapture(event.pointerId);
    onBegin();
  };
  const pointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = captured.current;
    if (disabled || !drag || drag.pointerId !== event.pointerId) return;
    update(drag.value + (event.clientX - drag.clientX) / Math.max(0.0001, zoom));
  };
  const pointerUp = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = captured.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    captured.current = null;
    const value = clampTrim(range, edge, drag.value + (event.clientX - drag.clientX) / Math.max(0.0001, zoom), duration, 1000, 100);
    void onCommit({ id: clip.id, ...value });
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (disabled || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void onCommit(range); return; }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault(); event.stopPropagation();
    const step = (event.shiftKey ? 1000 : 100) * (event.key === "ArrowLeft" ? -1 : 1);
    update(active + step);
  };
  return <Tooltip content={disabled ? reason || "Trimming is unavailable." : null}>
    <span className={`tl-trim-handle tl-trim-${position}`} role="slider" tabIndex={disabled ? -1 : 0} aria-label={`Trim ${edge} of ${clip.title || "scene"}`} aria-disabled={disabled} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.round(active)} aria-valuetext={formatTime(active)} title={disabled ? reason || "Trimming is unavailable." : undefined} onClick={(event) => event.stopPropagation()} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancel} onBlur={cancel} onKeyDown={onKeyDown} />
  </Tooltip>;
}
