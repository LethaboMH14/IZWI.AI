"use client";
// Thumbnails and filmstrip frames drawn from the project's own preview video in the browser, so no new backend
// job is needed (PLAN.md decision 5). One hidden extractor <video> per proxy (never the visible player), one seek
// at a time, small JPEG blobs kept for this session only and released on project switch or sign-out.
import { useEffect, useState } from "react";

const W = 160;
const H = 90;
type Job = { ms: number; resolve: (url: string | null) => void };
type Extractor = { video: HTMLVideoElement; queue: Job[]; busy: boolean; failed: boolean };

const cache = new Map<string, string>(); // `${proxyId}:${ms}` -> blob: URL
const pending = new Map<string, Promise<string | null>>();
const extractors = new Map<string, Extractor>();

const keyOf = (proxyId: string, ms: number) => `${proxyId}:${Math.round(ms)}`;

function extractorFor(proxyId: string): Extractor {
  let x = extractors.get(proxyId);
  if (x) return x;
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.src = `/api/media/${encodeURIComponent(proxyId)}`; // same origin, so the canvas is never tainted
  x = { video, queue: [], busy: false, failed: false };
  video.addEventListener("error", () => { x!.failed = true; for (const j of x!.queue.splice(0)) j.resolve(null); });
  extractors.set(proxyId, x);
  return x;
}

function once(el: HTMLVideoElement, event: string, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const t = setTimeout(() => { el.removeEventListener(event, on); resolve(false); }, timeoutMs);
    const on = () => { clearTimeout(t); el.removeEventListener(event, on); resolve(true); };
    el.addEventListener(event, on);
  });
}

async function drain(x: Extractor) {
  if (x.busy) return;
  x.busy = true;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  while (x.queue.length && !x.failed && ctx) {
    const job = x.queue.shift()!;
    if (x.video.readyState < 1 && !(await once(x.video, "loadedmetadata", 15_000))) { job.resolve(null); continue; }
    const dur = x.video.duration;
    if (!Number.isFinite(dur) || x.video.videoWidth === 0) { job.resolve(null); continue; } // audio-only: no frames
    x.video.currentTime = Math.min(Math.max(job.ms / 1000, 0), Math.max(dur - 0.05, 0));
    if (!(await once(x.video, "seeked", 8_000))) { job.resolve(null); continue; }
    // Cover-fit the frame into 160x90.
    const vw = x.video.videoWidth, vh = x.video.videoHeight;
    const scale = Math.max(W / vw, H / vh);
    const dw = vw * scale, dh = vh * scale;
    ctx.drawImage(x.video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.72));
    job.resolve(blob ? URL.createObjectURL(blob) : null);
  }
  x.busy = false;
}

/** A frame of the proxy video at `ms`, as a blob: URL, or null for audio-only media or a failed decode. */
export function getFrame(proxyId: string, ms: number): Promise<string | null> {
  const key = keyOf(proxyId, ms);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const x = extractorFor(proxyId);
  const p = new Promise<string | null>((resolve) => {
    x.queue.push({ ms, resolve });
    void drain(x);
  }).then((url) => {
    pending.delete(key);
    if (url) cache.set(key, url);
    return url;
  });
  pending.set(key, p);
  return p;
}

/** React hook: the frame at `ms` once drawn (null until then, or for audio-only media). */
export function useFrame(proxyId: string | null | undefined, ms: number): string | null {
  const key = proxyId ? keyOf(proxyId, ms) : "";
  const [url, setUrl] = useState<string | null>(() => (key ? cache.get(key) ?? null : null));
  useEffect(() => {
    if (!proxyId) return;
    let live = true;
    void getFrame(proxyId, ms).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [proxyId, ms]);
  return key && cache.get(key) ? cache.get(key)! : url;
}

/** Evenly spaced sample times for a filmstrip of `count` frames over `durationMs`. */
export function stripTimes(durationMs: number, count: number): number[] {
  if (!(durationMs > 0) || count < 1) return [];
  const step = durationMs / count;
  return Array.from({ length: count }, (_, i) => Math.round(step * i + step / 2));
}

/** Release every frame and extractor (project switch, sign-out). */
export function clearFrames() {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  pending.clear();
  for (const x of extractors.values()) { x.queue.splice(0); x.video.removeAttribute("src"); x.video.load(); }
  extractors.clear();
}
