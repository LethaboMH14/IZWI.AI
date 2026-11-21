// The rights gate. An export is held until the creator has declared the work and everyone who appears in
// that stretch of the recording has said yes. Enforced on the server when the render is queued and again when it runs.
import { all, one } from "./db";

export type Gate = { ok: boolean; declaration: boolean; waiting: { personId: string; name: string; status: string }[] };

export function gateFor(projectId: string, startMs: number, endMs: number): Gate {
  const declaration = !!one(`SELECT id FROM declaration WHERE project_id = ? LIMIT 1`, projectId);
  const people = all<{ id: string; name: string; whole_recording: number }>(`SELECT id, name, whole_recording FROM person WHERE project_id = ?`, projectId);
  const waiting: Gate["waiting"] = [];
  for (const p of people) {
    const inClip = p.whole_recording === 1 || !!one(`SELECT 1 FROM appearance WHERE person_id = ? AND start_ms < ? AND end_ms > ?`, p.id, endMs, startMs);
    if (!inClip) continue;
    const c = one<{ status: string }>(`SELECT status FROM consent WHERE person_id = ? ORDER BY requested_at DESC LIMIT 1`, p.id);
    if (c?.status !== "granted") waiting.push({ personId: p.id, name: p.name, status: c?.status ?? "not asked" });
  }
  return { ok: declaration && waiting.length === 0, declaration, waiting };
}

export function gateReason(g: Gate) {
  if (!g.declaration) return "Record your creator declaration first.";
  return `Waiting on ${g.waiting.map((w) => `${w.name} (${w.status})`).join(", ")}.`;
}

export const DECLARATION =
  "I made this recording or have permission to use everything in it, including music, footage and voices. This is my statement; IZWI does not verify ownership.";

export function consentStatement(name: string, projectTitle: string, scope: string) {
  const what = scope === "voice" ? "my voice" : scope === "likeness" ? "my face and likeness" : "my appearance, voice and words";
  return `I, ${name}, agree that ${what} in “${projectTitle}” may be cut into clips, captioned or translated, and published by the creator. I can withdraw this later; anything already published stays published.`;
}
