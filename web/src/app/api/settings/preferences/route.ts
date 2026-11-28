import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { now, run } from "@/server/db";
import { preferencesEnabled } from "@/server/flags";
import { readUserPreferences } from "@/server/preferences";

export const runtime = "nodejs";

const Input = z.object({
  theme: z.enum(["approved", "warm", "high-contrast"]),
  accent: z.enum(["amber", "terracotta", "forest", "ocean"]),
  fontPair: z.enum(["project", "clean"]),
  textSize: z.enum(["standard", "large", "larger"]),
  reducedMotion: z.boolean(),
}).strict();

function enabled() {
  if (!preferencesEnabled()) fail(404, "Not found.");
}

export const GET = route(async () => {
  enabled();
  const ctx = await requireCtx();
  return readUserPreferences(ctx.userId);
});

export const PATCH = route(async (req) => {
  enabled();
  const ctx = await requireCtx();
  const preferences = await body(req, Input);
  await run(`INSERT INTO user_preferences (user_id, theme, accent, font_pair, text_size, reduced_motion, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, accent = excluded.accent,
      font_pair = excluded.font_pair, text_size = excluded.text_size, reduced_motion = excluded.reduced_motion,
      updated_at = excluded.updated_at`,
  ctx.userId, preferences.theme, preferences.accent, preferences.fontPair, preferences.textSize, preferences.reducedMotion ? 1 : 0, now());
  return readUserPreferences(ctx.userId);
});
