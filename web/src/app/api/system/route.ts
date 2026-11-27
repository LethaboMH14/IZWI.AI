// Live status of the machinery: is the worker running, which tools it found, what is queued, what was used.
import { existsSync } from "node:fs";
import { route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { all, now, one, parse } from "@/server/db";
import { BIN } from "@/server/env";

export const runtime = "nodejs";

export const GET = route(async () => {
  const ctx = await requireCtx();
  const beat = await one<{ worker_id: string; info: string; seen_at: number }>(`SELECT * FROM worker_beat ORDER BY seen_at DESC LIMIT 1`);
  const online = !!beat && now() - beat.seen_at < 15_000;
  const queue = Object.fromEntries((await all<{ status: string; n: number }>(`SELECT status, COUNT(*) n FROM job WHERE workspace_id = ? GROUP BY status`, ctx.workspaceId)).map((r) => [r.status, r.n]));
  const storage = (await one<{ bytes: number }>(`SELECT COALESCE(SUM(bytes), 0) bytes FROM asset WHERE workspace_id = ?`, ctx.workspaceId))!.bytes;
  const usage = await all<{ unit: string; provider: string; total: number }>(
    `SELECT unit, provider, SUM(amount) total FROM usage_event WHERE workspace_id = ? AND created_at > ? GROUP BY unit, provider`, ctx.workspaceId, now() - 30 * 86400_000,
  );
  return {
    worker: { online, seenAgoMs: beat ? now() - beat.seen_at : null, info: beat ? parse(beat.info, {}) : null },
    files: { whisper: existsSync(BIN.whisper), whisperModel: existsSync(BIN.whisperModel), captionFont: existsSync(`${BIN.fonts}/ArchivoBlack-Regular.ttf`) },
    queue, storageBytes: storage, usage,
  };
});
