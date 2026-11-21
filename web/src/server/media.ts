// FFmpeg, ffprobe and whisper.cpp wrappers. Arguments are always arrays: no shell, so file names and
// user text can never become commands. Every call has a timeout and can be cancelled.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { BIN, LIMITS } from "./env";
import type { Seg, Word } from "./captions";

export class ToolError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

type RunOpts = { cwd?: string; timeoutMs?: number; signal?: AbortSignal; onLine?: (l: string) => void; onStdout?: (b: Buffer) => void };

export function runTool(cmd: string, args: string[], o: RunOpts = {}): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: o.cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    let pending = "";
    const kill = () => p.kill("SIGKILL");
    const timer = o.timeoutMs ? setTimeout(kill, o.timeoutMs) : null;
    o.signal?.addEventListener("abort", kill, { once: true });
    p.stdout.on("data", (b: Buffer) => (o.onStdout ? o.onStdout(b) : out.push(b)));
    p.stderr.on("data", (b: Buffer) => {
      const s = b.toString();
      err = (err + s).slice(-20000);
      if (!o.onLine) return;
      pending += s;
      const lines = pending.split(/\r?\n|\r/);
      pending = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) o.onLine(l);
    });
    p.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(new ToolError(`Could not start ${cmd}: ${e.message}`));
    });
    p.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (o.signal?.aborted) return reject(new ToolError("Cancelled"));
      resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr: err });
    });
  });
}

export type Probe = {
  durationMs: number; hasVideo: boolean; hasAudio: boolean; width?: number; height?: number; fps?: number;
  vcodec?: string; acodec?: string; format: string; rotation?: number; bytes?: number;
};

type FfStream = { codec_type: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; duration?: string; disposition?: { attached_pic?: number }; side_data_list?: { rotation?: number }[]; tags?: { rotate?: string } };

export async function probe(file: string): Promise<Probe> {
  const r = await runTool(BIN.ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeoutMs: 60_000 });
  if (r.code !== 0) throw new ToolError("This file could not be read as audio or video.");
  const j = JSON.parse(r.stdout.toString()) as { streams?: FfStream[]; format?: { duration?: string; format_name?: string; size?: string } };
  const v = j.streams?.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
  const a = j.streams?.find((s) => s.codec_type === "audio");
  const dur = Number(j.format?.duration ?? v?.duration ?? a?.duration ?? 0);
  const [n, d] = (v?.avg_frame_rate ?? "0/1").split("/").map(Number);
  const rot = v?.side_data_list?.find((x) => typeof x.rotation === "number")?.rotation ?? (v?.tags?.rotate ? Number(v.tags.rotate) : 0);
  const swap = Math.abs(rot) === 90 || Math.abs(rot) === 270;
  return {
    durationMs: Math.round(dur * 1000), hasVideo: !!v, hasAudio: !!a,
    width: swap ? v?.height : v?.width, height: swap ? v?.width : v?.height,
    fps: d ? Math.round((n / d) * 100) / 100 : undefined, vcodec: v?.codec_name, acodec: a?.codec_name,
    format: j.format?.format_name ?? "unknown", rotation: rot, bytes: j.format?.size ? Number(j.format.size) : undefined,
  };
}

// ffmpeg -progress writes out_time_us=... lines; turn them into 0..1.
function progressFrom(totalMs: number, cb?: (p: number) => void) {
  return (l: string) => {
    const m = /^out_time_us=(\d+)/.exec(l) ?? /^out_time_ms=(\d+)/.exec(l);
    if (m && cb && totalMs > 0) cb(Math.min(0.999, Number(m[1]) / 1000 / totalMs));
  };
}

export async function ffmpeg(args: string[], o: { totalMs: number; onProgress?: (p: number) => void; signal?: AbortSignal; cwd?: string; timeoutMs?: number }) {
  const r = await runTool(BIN.ffmpeg, ["-y", "-hide_banner", "-nostats", "-progress", "pipe:2", ...args], {
    cwd: o.cwd, signal: o.signal, timeoutMs: o.timeoutMs ?? 6 * 3600_000, onLine: progressFrom(o.totalMs, o.onProgress),
  });
  if (r.code !== 0) {
    const last = r.stderr.split(/\r?\n/).filter((l) => l && !l.includes("=")).slice(-3).join(" ");
    throw new ToolError(`FFmpeg could not finish: ${last.slice(0, 300) || "unknown error"}`);
  }
}

export async function makeProxy(src: string, out: string, p: Probe, onProgress?: (x: number) => void, signal?: AbortSignal) {
  const args = ["-i", src];
  if (p.hasVideo) args.push("-map", "0:v:0", "-vf", "scale=-2:'min(480,ih)',format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28");
  else args.push("-vn");
  if (p.hasAudio) args.push("-map", "0:a:0", "-c:a", "aac", "-b:a", "96k", "-ac", "2");
  args.push("-movflags", "+faststart", out);
  await ffmpeg(args, { totalMs: p.durationMs, onProgress, signal });
}

export async function extractSpeechWav(src: string, out: string, totalMs: number, signal?: AbortSignal) {
  await ffmpeg(["-i", src, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out], { totalMs, signal });
}

export async function poster(src: string, out: string, durationMs: number) {
  const at = Math.min(2, durationMs / 3000);
  await ffmpeg(["-ss", at.toFixed(2), "-i", src, "-frames:v", "1", "-vf", "scale=-2:'min(720,ih)'", "-q:v", "3", out], { totalMs: 1 });
}

// Waveform peaks streamed from 8 kHz mono PCM, so a three-hour file never sits in memory.
export async function peaks(src: string, durationMs: number, signal?: AbortSignal): Promise<number[]> {
  const buckets = Math.max(200, Math.min(2400, Math.round(durationMs / 100)));
  const perBucket = Math.max(1, Math.ceil(((durationMs / 1000) * 8000) / buckets));
  const out: number[] = [];
  let cur = 0, count = 0, carry: Buffer | null = null;
  const r = await runTool(BIN.ffmpeg, ["-hide_banner", "-i", src, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"], {
    signal, timeoutMs: 3 * 3600_000,
    onStdout: (chunk) => {
      const b = carry ? Buffer.concat([carry, chunk]) : chunk;
      const usable = b.length - (b.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const v = Math.abs(b.readInt16LE(i));
        if (v > cur) cur = v;
        if (++count >= perBucket) { out.push(cur); cur = 0; count = 0; }
      }
      carry = usable < b.length ? b.subarray(usable) : null;
    },
  });
  if (r.code !== 0) throw new ToolError("Could not read the audio to draw a waveform.");
  if (count) out.push(cur);
  const max = Math.max(1, ...out);
  return out.map((x) => Math.round((x / max) * 1000) / 1000);
}

export type Transcript = { language: string; segments: Seg[]; engine: string };

type WhisperJson = {
  result?: { language?: string };
  transcription: { offsets: { from: number; to: number }; text: string; tokens?: { text: string; offsets: { from: number; to: number }; p: number }[] }[];
};

export async function whisper(wav: string, outBase: string, o: { language?: string; prompt?: string; accurate?: boolean; onProgress?: (p: number) => void; signal?: AbortSignal }): Promise<Transcript> {
  const args = ["-m", BIN.whisperModel, "-f", wav, "-l", o.language || "auto", "-t", String(LIMITS.whisperThreads), "-ojf", "-of", outBase, "-pp"];
  if (!o.accurate) args.push("-bs", "1", "-bo", "1");
  if (o.prompt) args.push("--prompt", o.prompt.slice(0, 600));
  const r = await runTool(BIN.whisper, args, {
    signal: o.signal, timeoutMs: 6 * 3600_000,
    onLine: (l) => {
      const m = /progress\s*=\s*(\d+)%/.exec(l);
      if (m && o.onProgress) o.onProgress(Number(m[1]) / 100);
    },
  });
  if (r.code !== 0) throw new ToolError(`Transcription stopped: ${r.stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(" ").slice(0, 300)}`);
  const j = JSON.parse(readFileSync(outBase + ".json", "utf8")) as WhisperJson;
  return { language: j.result?.language || o.language || "und", segments: j.transcription.map(toSeg).filter((s) => s.text), engine: "whisper.cpp base" };
}

function toSeg(s: WhisperJson["transcription"][number]): Seg {
  const words: Word[] = [];
  for (const t of s.tokens ?? []) {
    if (t.text.startsWith("[_") || !t.text.trim()) continue;
    const startsWord = t.text.startsWith(" ") || words.length === 0;
    if (startsWord) words.push({ w: t.text.trim(), s: t.offsets.from, e: t.offsets.to, p: Math.round(t.p * 100) / 100 });
    else {
      const w = words[words.length - 1];
      w.w += t.text;
      w.e = t.offsets.to;
      w.p = Math.min(w.p ?? 1, Math.round(t.p * 100) / 100);
    }
  }
  return { startMs: s.offsets.from, endMs: Math.max(s.offsets.to, s.offsets.from + 200), text: s.text.trim(), words: words.filter((w) => w.w) };
}

export async function toolVersions() {
  const v = async (cmd: string, args: string[], re: RegExp) => {
    try {
      const r = await runTool(cmd, args, { timeoutMs: 10_000 });
      const m = re.exec(r.stdout.toString() + r.stderr);
      return m ? m[1] : "present";
    } catch {
      return null;
    }
  };
  return {
    ffmpeg: await v(BIN.ffmpeg, ["-version"], /ffmpeg version (\S+)/),
    // The build is only named when the setup script's checksum marker proves which release was unpacked.
    whisper: await v(BIN.whisper, ["--help"], /(usage)/i).then((x) => {
      if (!x) return null;
      try {
        const marker = readFileSync(`${BIN.whisper.replace(/[\\/][^\\/]+$/, "")}/.sha256`, "utf8");
        return marker === "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb" ? "whisper.cpp b5454 (checksum verified)" : "whisper.cpp (unknown build)";
      } catch {
        return "whisper.cpp (unknown build)";
      }
    }),
  };
}
