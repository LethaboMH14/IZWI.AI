import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ffmpeg, probe, whisper } from "./media";
import type { JobCtx } from "./pipeline";

export async function transcribeVoiceJob(c: JobCtx): Promise<{ text: string }> {
  const sourcePath = c.input.sourcePath;
  const tempDir = c.input.tempDir;
  if (typeof sourcePath !== "string" || typeof tempDir !== "string" || !path.resolve(sourcePath).startsWith(path.resolve(tempDir) + path.sep)) throw new Error("Voice job input is invalid.");
  try {
    const p = await probe(sourcePath);
    if (!p.hasAudio || p.durationMs <= 0 || p.durationMs > 60_000) throw new Error("Audio must be at most 60 seconds long.");
    const work = mkdtempSync(path.join(tmpdir(), "izwi-voice-"));
    try {
      const wav = path.join(work, "audio.wav");
      await ffmpeg(["-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav], { totalMs: p.durationMs, signal: c.signal, timeoutMs: 60_000 });
      const transcript = await whisper(wav, path.join(work, "transcript"), { signal: c.signal });
      return { text: transcript.segments.map((s) => s.text).join(" ").trim() };
    } finally { rmSync(work, { recursive: true, force: true }); }
  } finally { rmSync(tempDir, { recursive: true, force: true }); }
}
