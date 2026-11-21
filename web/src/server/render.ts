// Platform-ready renders. Video sources keep the whole frame over a blurred fill; audio-only sources become an
// audiogram (waveform on ivory). Loudness is normalised to -14 LUFS. Captions are burned in from an ASS file.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BIN } from "./env";
import { ffmpeg } from "./media";

export const PRESETS = {
  vertical: { label: "9:16 vertical", w: 1080, h: 1920, crf: 21, abr: "128k", use: "Reels, Shorts, TikTok" },
  square: { label: "1:1 square", w: 1080, h: 1080, crf: 21, abr: "128k", use: "Feed posts" },
  wide: { label: "16:9 wide", w: 1920, h: 1080, crf: 21, abr: "128k", use: "YouTube, web" },
  small: { label: "Small file", w: 720, h: 1280, crf: 28, abr: "96k", use: "WhatsApp Status and low data" },
} as const;
export type PresetId = keyof typeof PRESETS;
export const isPreset = (p: string): p is PresetId => p in PRESETS;

export async function renderClip(o: {
  src: string; out: string; workDir: string; startMs: number; endMs: number; preset: PresetId;
  hasVideo: boolean; hasAudio: boolean; ass?: string; onProgress?: (p: number) => void; signal?: AbortSignal;
}) {
  const P = PRESETS[o.preset];
  const dur = o.endMs - o.startMs;
  mkdirSync(o.workDir, { recursive: true });
  let subs = "";
  if (o.ass) {
    writeFileSync(path.join(o.workDir, "captions.ass"), o.ass, "utf8");
    mkdirSync(path.join(o.workDir, "fonts"), { recursive: true });
    copyFileSync(path.join(BIN.fonts, "ArchivoBlack-Regular.ttf"), path.join(o.workDir, "fonts", "ArchivoBlack-Regular.ttf"));
    subs = ",subtitles=captions.ass:fontsdir=fonts";
  }
  const parts: string[] = [];
  if (o.hasVideo) {
    parts.push(
      `[0:v]split=2[a][b]`,
      `[a]scale=${P.w}:${P.h}:force_original_aspect_ratio=increase,crop=${P.w}:${P.h},boxblur=luma_radius=40:luma_power=2,eq=brightness=-0.05[bg]`,
      `[b]scale=${P.w}:${P.h}:force_original_aspect_ratio=decrease[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p${subs}[v]`,
    );
    if (o.hasAudio) parts.push(`[0:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`);
  } else {
    parts.push(
      `color=c=0xFAF8F4:s=${P.w}x${P.h}:r=30:d=${(dur / 1000).toFixed(3)}[bg]`,
      `[0:a]asplit=2[aw][ax]`,
      `[aw]showwaves=s=${P.w}x${Math.round(P.h * 0.24)}:mode=cline:colors=0xE9A21B:rate=30,format=rgba[w]`,
      `[bg][w]overlay=0:(H-h)/2,format=yuv420p${subs}[v]`,
      `[ax]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`,
    );
  }
  const args = ["-ss", (o.startMs / 1000).toFixed(3), "-t", (dur / 1000).toFixed(3), "-i", o.src, "-filter_complex", parts.join(";"), "-map", "[v]"];
  if (o.hasAudio) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", P.abr);
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(P.crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", o.out);
  await ffmpeg(args, { totalMs: dur, onProgress: o.onProgress, signal: o.signal, cwd: o.workDir });
}
