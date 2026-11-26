"use client";
import { Waveform } from "@phosphor-icons/react";
import { useFrame } from "@/lib/frames";
import { useProject } from "@/components/workspace/ProjectProvider";
import { useFrameSource } from "./hooks";

/** One frame from the scene's start, cut from the preview in the browser; the poster stands in until it is ready. */
export function SceneThumb({ startMs, endMs, className }: { startMs: number; endMs: number; className?: string }) {
  const proxyId = useFrameSource();
  const posterId = useProject((s) => s.state.poster?.id);
  const frame = useFrame(proxyId, startMs + Math.min(500, Math.floor((endMs - startMs) / 2)));
  const src = frame ?? (posterId ? `/api/media/${posterId}` : null);
  return (
    <span className={`fs-thumb${className ? ` ${className}` : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- browser frame and same-origin media URLs */}
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <Waveform size={18} />}
    </span>
  );
}
