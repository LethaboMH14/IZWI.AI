import { createHash } from "node:crypto";
import path from "node:path";
import { all, now, one, run } from "./db";
import { STORAGE } from "./env";
import { enqueue, type JobType } from "./jobs";

export const INJECTION_MODEL = "protectai/deberta-v3-base-prompt-injection-v2";
export const INJECTION_MODEL_REV = "90c9989b1a342275dd0d1a95aad283c04e075671";
export const INJECTION_THRESHOLD = 0.7;
export const INJECTION_BATCH_SIZE = 40;

export type InjectionLine = { id: string; idx: number; text: string };
export type InjectionScorer = (text: string) => Promise<number>;
type Classifier = (text: string) => Promise<{ label: string; score: number }[]>;

export const injectionEnabled = () => process.env.IZWI_FLAG_INJECTION === "1";
const textHash = (text: string) => createHash("sha256").update(text).digest("hex");
let classifierPromise: Promise<Classifier> | undefined;

async function loadClassifier(): Promise<Classifier> {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.cacheDir = path.join(STORAGE, "models");
      env.allowRemoteModels = true;
      if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
      const classify = await pipeline("text-classification", INJECTION_MODEL, {
        revision: INJECTION_MODEL_REV,
        dtype: "fp32",
        device: "cpu",
      });
      return async (text: string) => {
        const output = await classify(text, { top_k: null }) as { label: string; score: number }[];
        return output;
      };
    })().catch((error) => {
      classifierPromise = undefined;
      throw error;
    });
  }
  return classifierPromise;
}

export async function recordInjectionScans(
  lines: InjectionLine[],
  scoreText: InjectionScorer,
  scannedAt = now(),
) {
  if (lines.length > INJECTION_BATCH_SIZE) throw new Error("An injection scan batch may contain at most 40 lines.");
  for (const line of lines) {
    const score = await scoreText(line.text);
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error("The injection classifier returned an invalid score.");
    await run(
      `INSERT INTO line_injection_scan (line_id, text_hash, model_rev, score, status, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(line_id) DO UPDATE SET text_hash = excluded.text_hash, model_rev = excluded.model_rev,
         score = excluded.score, status = excluded.status, scanned_at = excluded.scanned_at`,
      line.id,
      textHash(line.text),
      INJECTION_MODEL_REV,
      score,
      score > INJECTION_THRESHOLD ? "flagged" : "clear",
      scannedAt,
    );
  }
  return lines.length;
}

/** Queues a fresh check for lines whose text changed after they were scanned. Does nothing with the check off. */
export async function queueRescan(input: { workspaceId: string; projectId: string; trackId: string; lineIds: string[]; createdBy: string }) {
  if (!injectionEnabled()) return;
  for (let k = 0; k < input.lineIds.length; k += INJECTION_BATCH_SIZE) {
    await enqueue({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      type: "injection_scan" as unknown as JobType,
      input: { trackId: input.trackId, lineIds: input.lineIds.slice(k, k + INJECTION_BATCH_SIZE) },
      createdBy: input.createdBy,
    });
  }
}

export async function scanProjectBatch(input: {
  workspaceId: string;
  projectId: string;
  trackId: string;
  afterIdx?: number;
  /** Only these lines (a rescan after an edit). Without it the whole track is walked in batches. */
  lineIds?: string[];
  createdBy?: string | null;
  scoreText?: InjectionScorer;
}) {
  const afterIdx = input.afterIdx ?? -1;
  const track = await one<{ id: string }>(
    `SELECT id FROM caption_track WHERE id = ? AND workspace_id = ? AND project_id = ? AND kind = 'source'`,
    input.trackId, input.workspaceId, input.projectId,
  );
  if (!track) return { scanned: 0, more: false, afterIdx };

  const scoreText = input.scoreText ?? (async (text) => injectionScore(await (await loadClassifier())(text)));
  if (input.lineIds) {
    const ids = input.lineIds.slice(0, INJECTION_BATCH_SIZE);
    const edited = ids.length
      ? await all<InjectionLine>(`SELECT id, idx, text FROM caption_line WHERE track_id = ? AND id IN (${ids.map(() => "?").join(",")}) ORDER BY idx`, input.trackId, ...ids)
      : [];
    await recordInjectionScans(edited, scoreText);
    return { scanned: edited.length, more: false, afterIdx };
  }

  const rows = await all<InjectionLine>(
    `SELECT id, idx, text FROM caption_line WHERE track_id = ? AND idx > ? ORDER BY idx LIMIT ?`,
    input.trackId, afterIdx, INJECTION_BATCH_SIZE + 1,
  );
  const batch = rows.slice(0, INJECTION_BATCH_SIZE);
  await recordInjectionScans(batch, scoreText);
  const nextIdx = batch.at(-1)?.idx ?? afterIdx;
  const more = rows.length > INJECTION_BATCH_SIZE;

  if (more) {
    await enqueue({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      type: "injection_scan" as unknown as JobType,
      input: { trackId: input.trackId, afterIdx: nextIdx },
      idempotencyKey: `injection_scan:${input.trackId}:${nextIdx}`,
      createdBy: input.createdBy ?? null,
      priority: 0,
    });
  }
  return { scanned: batch.length, more, afterIdx: nextIdx };
}

export function injectionScore(output: { label: string; score: number }[]): number {
  const prediction = output[0];
  if (!prediction || !Number.isFinite(prediction.score)) throw new Error("The injection classifier returned no score.");
  const label = prediction.label.toLowerCase();
  if (label === "injection" || label === "1") return prediction.score;
  if (label === "safe" || label === "0") return 1 - prediction.score;
  throw new Error("The injection classifier returned an unknown label.");
}

export async function scoreInjectionLine(text: string) {
  const classify = await loadClassifier();
  return injectionScore(await classify(text));
}
