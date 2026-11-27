import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { newId, one, parse } from "../../../../../../server/db";
import { HttpError, route } from "../../../../../../server/http";
import { requireCtx, projectOf } from "../../../../../../server/guard";
import { enqueueVoice, cancelQueued } from "../../../../../../server/jobs";
import { STORAGE } from "../../../../../../server/env";
import { limit, LIMIT, RateLimitError } from "../../../../../../server/ratelimit";
import { all } from "../../../../../../server/db";
import { assistantEnabled } from "../../../../../../server/flags";

const MAX = 10 * 1024 * 1024;
async function cappedForm(req: Request) {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX + 64 * 1024) throw new HttpError(413, "Audio file is too large.");
  if (!req.body) throw new HttpError(415, "Add an audio file.");
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX + 64 * 1024) { await reader.cancel().catch(() => {}); throw new HttpError(413, "Audio file is too large."); } chunks.push(value); }
  const rebuilt = new Request(req.url, { method: "POST", headers: { "content-type": req.headers.get("content-type") ?? "" }, body: Buffer.concat(chunks) });
  return rebuilt.formData();
}

export const POST = route<{ id: string }>(async (req, { id }) => {
  // Same kill switch as the chat route: off means 404 before the session or the upload is read.
  if (!assistantEnabled()) throw new HttpError(404, "Not found.");
  const ctx = await requireCtx(); const project = projectOf(ctx, id);
  try { limit(`voice:${ctx.workspaceId}:${ctx.userId}`, LIMIT.voice); }
  catch (e) { if (e instanceof RateLimitError) return Response.json({ error: e.message, retryAfter: e.retryAfterSec }, { status: 429, headers: { "Retry-After": String(e.retryAfterSec) } }); throw e; }
  if (all<{ id: string }>(`SELECT id FROM job WHERE created_by = ? AND type = 'voice_transcribe' AND status IN ('queued','running') LIMIT 1`, ctx.userId).length) return Response.json({ error: "A voice transcription is already open.", retryAfter: 60 }, { status: 429, headers: { "Retry-After": "60" } });
  if (!/^multipart\/form-data\b/i.test(req.headers.get("content-type") ?? "")) throw new HttpError(415, "Send audio as multipart form data.");
  const form = await cappedForm(req);
  const fields = [...form.entries()];
  if (fields.length !== 1 || fields[0][0] !== "audio" || !(fields[0][1] instanceof File)) throw new HttpError(415, "Send one audio file in the audio field.");
  const file = fields[0][1];
  if (file.size > MAX) throw new HttpError(413, "Audio file is too large.");
  if (!file.type.startsWith("audio/")) throw new HttpError(415, "Choose an audio file.");
  if (req.signal.aborted) throw new HttpError(499, "The request was cancelled.");
  const idJob = newId("job"); const requestId = randomUUID();
  const tempDir = path.join(STORAGE, "tmp", "assistant-voice", idJob);
  await mkdir(tempDir, { recursive: true });
  const sourcePath = path.join(tempDir, "audio.upload");
  await writeFile(sourcePath, Buffer.from(await file.arrayBuffer()));
  const job = enqueueVoice({ workspaceId: ctx.workspaceId, projectId: project.id, idempotencyKey: `voice:${requestId}`, input: { sourcePath, tempDir }, createdBy: ctx.userId });
  if (!job) { await rm(tempDir, { recursive: true, force: true }); return Response.json({ error: "A voice transcription is already open.", retryAfter: 60 }, { status: 429, headers: { "Retry-After": "60" } }); }
  const until = Date.now() + 60_000;
  let started = false;
  const onAbort = () => { if (!started && cancelQueued(job.id, ctx.workspaceId)) void rm(tempDir, { recursive: true, force: true }); };
  req.signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (Date.now() < until) {
      if (req.signal.aborted) { cancelQueued(job.id, ctx.workspaceId); throw new HttpError(499, "The request was cancelled."); }
      const row = one<{ status: string; output: string | null; error: string | null }>(`SELECT status, output, error FROM job WHERE id = ? AND workspace_id = ?`, job.id, ctx.workspaceId);
      if (!row) throw new HttpError(404, "Voice job not found.");
      if (row.status === "running" || row.status === "succeeded" || row.status === "failed") started = true;
      if (row.status === "succeeded") return parse(row.output, { text: "" });
      if (["failed", "blocked", "cancelled"].includes(row.status)) throw new HttpError(422, row.error ?? "Audio transcription failed.");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (cancelQueued(job.id, ctx.workspaceId)) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return Response.json({ error: "Whisper is busy. Try again shortly.", retryAfter: 60 }, { status: 429, headers: { "Retry-After": "60" } });
  } finally { req.signal.removeEventListener("abort", onAbort); }
});
