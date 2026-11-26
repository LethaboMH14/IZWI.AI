"use client";
// The preview. The visible <video> is the clock: it writes the playhead and obeys seek and play requests.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, ArrowCounterClockwise, Check, ClosedCaptioning, CornersOut, Pause, Play } from "@phosphor-icons/react";
import { Button, DropdownMenu, IconButton, Timecode, type MenuItem } from "@/components/z";
import { formatTime } from "@/lib/timecode";
import { lineIndexAt, nudge, wordIndexAt, type Word } from "@/lib/scenes";
import { usePlayhead, usePlayheadStore, useProject, useProjectStore } from "@/components/workspace/ProjectProvider";
import { useDurationMs, useFlat } from "./flat-context";
import { isActive, isFailed, latestJob, percentOf, retryJob } from "./jobs";

const RATES = [0.5, 1, 1.5, 2];
const BARS = 96;

/** Max of each bucket, so a short loud sound still shows. */
export function bucketPeaks(peaks: readonly number[], count: number): number[] {
  if (!peaks.length) return [];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i / count) * peaks.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / count) * peaks.length));
    let top = 0;
    for (let j = from; j < to && j < peaks.length; j++) top = Math.max(top, peaks[j]);
    out.push(top);
  }
  return out;
}

function PlayTime({ durationMs }: { durationMs: number }) {
  const ms = usePlayhead((s) => s.ms);
  return (
    <span className="fs-clock">
      <Timecode ms={ms} /> <span aria-hidden="true">/</span> <Timecode ms={durationMs} />
    </span>
  );
}

function Scrub({ durationMs, disabled }: { durationMs: number; disabled: boolean }) {
  const ms = usePlayhead((s) => s.ms);
  const ph = usePlayheadStore();
  const { inMs, outMs } = useFlat();
  const pct = durationMs > 0 ? Math.min(100, (ms / durationMs) * 100) : 0;
  const tick = (value: number | null) => (value != null && durationMs > 0 ? Math.min(100, (value / durationMs) * 100) : null);
  const tickIn = tick(inMs), tickOut = tick(outMs);
  return (
    <span className="fs-scrubwrap" style={{ ["--p" as string]: `${pct}%` }}>
      <input
        type="range" className="fs-scrub" min={0} max={Math.max(1, durationMs)} step={100} value={Math.min(ms, Math.max(1, durationMs))}
        disabled={disabled} aria-label="Seek" aria-valuetext={`${formatTime(ms)} of ${formatTime(durationMs)}`}
        onChange={(e) => ph.getState().seekTo(Number(e.target.value))}
      />
      {tickIn != null && <span className="fs-tick" style={{ left: `${tickIn}%` }} aria-hidden="true" />}
      {tickOut != null && <span className="fs-tick fs-tick-out" style={{ left: `${tickOut}%` }} aria-hidden="true" />}
    </span>
  );
}

function Caption({ visible }: { visible: boolean }) {
  const lines = useProject((s) => s.state.lines);
  const index = usePlayhead((s) => lineIndexAt(lines, s.ms));
  const line = index >= 0 ? lines[index] : null;
  const words = line ? (line.words as unknown as Word[]) : [];
  // Edited lines have evenly spread word times, so they are not highlighted word by word.
  const useWords = !!line && !line.edited && words.length > 0;
  const word = usePlayhead((s) => (useWords ? wordIndexAt(words, s.ms) : -1));
  if (!visible || !line) return null;
  return (
    <p className="fs-caption" aria-live="off">
      {useWords ? words.map((w, i) => <span key={i} className={i === word ? "is-word" : undefined}>{w.w}{i < words.length - 1 ? " " : ""}</span>) : line.text}
    </p>
  );
}

function Envelope({ peaks, durationMs }: { peaks: number[]; durationMs: number }) {
  const bars = useMemo(() => bucketPeaks(peaks, BARS), [peaks]);
  const ms = usePlayhead((s) => s.ms);
  const pct = durationMs > 0 ? Math.min(100, (ms / durationMs) * 100) : 0;
  const draw = (cls: string, clip?: string) => (
    <span className={`fs-env-bars ${cls}`} style={clip ? { clipPath: clip } : undefined} aria-hidden="true">
      {bars.map((b, i) => <i key={i} style={{ height: `${Math.max(6, Math.round(b * 100))}%` }} />)}
    </span>
  );
  return (
    <div className="fs-env" role="img" aria-label="Recording envelope">
      {draw("fs-env-base")}
      {draw("fs-env-played", `inset(0 ${100 - pct}% 0 0)`)}
    </div>
  );
}

export function Preview() {
  const store = useProjectStore();
  const ph = usePlayheadStore();
  const proxy = useProject((s) => s.state.proxy);
  const poster = useProject((s) => s.state.poster);
  const source = useProject((s) => s.state.source);
  const jobs = useProject((s) => s.state.jobs);
  const peaks = useProject((s) => s.state.peaks);
  const readOnly = useProject((s) => s.readOnly.value);
  const playing = usePlayhead((s) => s.playing);
  const request = usePlayhead((s) => s.request);
  const durationMs = useDurationMs();
  const { inMs, outMs } = useFlat();

  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stopAt = useRef<number | null>(null);
  const handled = useRef(ph.getState().request?.n ?? 0);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [rate, setRate] = useState(1);
  const [cc, setCc] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const audioOnly = !!proxy && proxy.mime.startsWith("audio/");
  const posterUrl = poster ? `/api/media/${poster.id}` : undefined;
  const canPlay = !!proxy && !failed;

  // Copy the video's time into the playhead, and stop at the end of a range when one was asked for.
  const sync = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const limit = stopAt.current;
    if (limit != null && v.currentTime >= limit) {
      stopAt.current = null;
      v.pause();
      v.currentTime = limit;
      ph.getState().set(Math.round(limit * 1000));
      return;
    }
    const ms = v.currentTime * 1000;
    if (Math.abs(ms - ph.getState().ms) >= 1) ph.getState().set(ms);
  }, [ph]);

  // Obey a seek or play request from anywhere else in the studio.
  useEffect(() => {
    if (!request || request.n === handled.current) return;
    handled.current = request.n;
    const v = videoRef.current;
    if (!v || failed) return;
    if (Math.abs(v.currentTime * 1000 - request.ms) > 50) v.currentTime = request.ms / 1000;
    stopAt.current = request.endMs != null ? request.endMs / 1000 : null;
    if (request.play) void v.play().catch(() => ph.getState().setPlaying(false));
    else v.pause();
  }, [request, failed, ph]);

  // While playing, follow the video every frame so the playhead and captions stay in step.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => { sync(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sync]);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate; }, [rate, reload, proxy?.id]);

  // The video goes away with the proxy; never leave the playhead claiming to play.
  useEffect(() => () => { ph.getState().setPlaying(false); }, [ph]);

  const preparing = useMemo(() => {
    if (proxy) return null;
    const job = latestJob(jobs, ["proxy", "probe"]);
    return { job, failed: isFailed(job), active: isActive(job) };
  }, [proxy, jobs]);

  const skip = (deltaMs: number) => ph.getState().seekTo(nudge(ph.getState().ms, deltaMs, durationMs));
  const fullscreen = () => {
    const wrap = wrapRef.current;
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    if (wrap?.requestFullscreen) void wrap.requestFullscreen().catch(() => undefined);
    else v?.webkitEnterFullscreen?.();
  };

  const rateItems: MenuItem[] = RATES.map((r) => ({ id: `r${r}`, label: `${r}×`, icon: r === rate ? Check : undefined, onSelect: () => setRate(r) }));
  const reason = !proxy ? "Preview not ready" : failed ? "Preview unavailable" : undefined;

  return (
    <div className="fs-preview" ref={wrapRef}>
      <div className="fs-stage">
        {proxy && !failed && (
          <video
            key={`${proxy.id}:${reload}`} ref={videoRef} className="fs-video" src={`/api/media/${proxy.id}`} poster={posterUrl}
            preload="metadata" playsInline tabIndex={-1} data-audio-only={audioOnly || undefined}
            onClick={() => ph.getState().togglePlay()}
            onTimeUpdate={sync} onSeeked={sync}
            onPlay={() => ph.getState().setPlaying(true)}
            onPause={() => { sync(); ph.getState().setPlaying(false); }}
            onEnded={() => ph.getState().setPlaying(false)}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              v.playbackRate = rate;
              const at = ph.getState().ms;
              if (at > 0 && Math.abs(v.currentTime * 1000 - at) > 50) v.currentTime = at / 1000;
            }}
            onError={() => { setFailed(true); ph.getState().setPlaying(false); }}
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- browser frame and same-origin media URLs */}
        {(!proxy || failed || audioOnly) && posterUrl && <img className="fs-poster" src={posterUrl} alt="" />}
        {audioOnly && !failed && !posterUrl && <Envelope peaks={peaks} durationMs={durationMs} />}

        {!proxy && (
          <div className="fs-panel" role="status">
            {!source ? (
              <strong>No recording yet</strong>
            ) : preparing?.failed ? (
              <>
                <strong>Preview unavailable</strong>
                <span className="fs-muted">{preparing.job?.error ? preparing.job.error : "Preparing failed"}</span>
                {retryError && <span className="fs-error">{retryError}</span>}
                <Button size="sm" loading={retrying} disabled={readOnly} disabledReason={readOnly ? "Read only" : undefined}
                  onClick={() => {
                    if (!preparing.job) return;
                    setRetrying(true); setRetryError(null);
                    retryJob(store, preparing.job.id).catch((e: unknown) => setRetryError(e instanceof Error ? e.message : "Retry failed")).finally(() => setRetrying(false));
                  }}>Retry</Button>
              </>
            ) : (
              <>
                <strong>Preparing preview</strong>
                {percentOf(preparing?.job) != null
                  ? <span className="fs-bar" role="progressbar" aria-label="Preparing preview" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentOf(preparing?.job) ?? 0}><i style={{ width: `${percentOf(preparing?.job)}%` }} /></span>
                  : <span className="fs-muted">Queued</span>}
                {percentOf(preparing?.job) != null && <span className="fs-muted fs-mono">{percentOf(preparing?.job)}%</span>}
              </>
            )}
          </div>
        )}
        {proxy && failed && (
          <div className="fs-panel" role="alert">
            <strong>Preview unavailable</strong>
            <Button size="sm" onClick={() => { setFailed(false); setReload((n) => n + 1); }}>Try again</Button>
          </div>
        )}

        {(inMs != null || outMs != null) && (
          <div className="fs-marks" aria-label="Scene marks">
            {inMs != null && <span className="fs-badge">In <span className="fs-mono">{formatTime(inMs)}</span></span>}
            {outMs != null && <span className="fs-badge">Out <span className="fs-mono">{formatTime(outMs)}</span></span>}
          </div>
        )}

        {canPlay && <Caption visible={cc} />}

        <div className="fs-controls">
          <IconButton tone="shell" size="sm" label={playing ? "Pause" : "Play"} shortcut="Space" disabled={!canPlay} disabledReason={reason}
            icon={playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />} onClick={() => ph.getState().togglePlay()} />
          <span className="fs-ctl-extra"><IconButton tone="shell" size="sm" label="Back 5 s" shortcut="Shift ←" disabled={!canPlay} disabledReason={reason} icon={<ArrowCounterClockwise size={18} />} onClick={() => skip(-5000)} /></span>
          <span className="fs-ctl-extra"><IconButton tone="shell" size="sm" label="Forward 5 s" shortcut="Shift →" disabled={!canPlay} disabledReason={reason} icon={<ArrowClockwise size={18} />} onClick={() => skip(5000)} /></span>
          <PlayTime durationMs={durationMs} />
          <Scrub durationMs={durationMs} disabled={!canPlay} />
          <span className="fs-ctl-extra">
            <DropdownMenu align="end" items={rateItems}
              trigger={<button type="button" className="fs-chipbtn fs-mono" aria-label={`Playback speed ${rate}×`} disabled={!canPlay}>{rate}×</button>} />
          </span>
          <button type="button" className="fs-chipbtn" aria-pressed={cc} aria-label="Captions" onClick={() => setCc((v) => !v)}>
            <ClosedCaptioning size={18} weight={cc ? "fill" : "regular"} aria-hidden="true" />
          </button>
          <IconButton tone="shell" size="sm" label="Fullscreen" disabled={!canPlay} disabledReason={reason} icon={<CornersOut size={18} />} onClick={fullscreen} />
        </div>
      </div>
    </div>
  );
}
