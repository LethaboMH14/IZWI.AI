import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ffmpeg, probe, whisper } from "./media";
import { localCopy, removeObject } from "./storage";
import type { JobCtx } from "./pipeline";

export async function transcribeVoiceJob(c: JobCtx): Promise<{ text: string }> {
  const key = c.input.key;
  const hostedKey = typeof key === "string" && key.startsWith(`${c.job.workspace_id}/${c.job.project_id}/voice-`) && !key.includes("..");
  const diskKey = key === `tmp/assistant-voice/${c.job.id}/audio.upload`;
  if (typeof key !== "string" || (!hostedKey && !diskKey)) throw new Error("Voice job input is invalid.");
  const sourcePath = await localCopy(key);
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
  } finally {
    await removeObject(key);
    if (diskKey) rmSync(path.dirname(sourcePath), { recursive: true, force: true });
  }
}
