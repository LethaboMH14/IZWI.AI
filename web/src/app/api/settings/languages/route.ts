import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { now, run } from "@/server/db";
import { languagesEnabled } from "@/server/flags";
import { readCreatorLanguages } from "@/server/languages";
import { GREETINGS } from "@/lib/greetings";

export const runtime = "nodejs";
const ids = GREETINGS.map((item) => item.id) as [string, ...string[]];
const Input = z.object({ languages: z.array(z.enum(ids)).min(1).max(GREETINGS.length) }).strict();
function enabled() { if (!languagesEnabled()) fail(404, "Not found."); }

export const GET = route(async () => {
  enabled();
  const ctx = await requireCtx();
  return { languages: await readCreatorLanguages(ctx.userId), options: GREETINGS };
});

export const PATCH = route(async (req) => {
  enabled();
  const ctx = await requireCtx();
  const { languages } = await body(req, Input);
  const unique = [...new Set(languages)];
  await run(`INSERT INTO user_preferences (user_id, languages, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET languages = excluded.languages, updated_at = excluded.updated_at`,
  ctx.userId, JSON.stringify(unique), now());
  return { languages: await readCreatorLanguages(ctx.userId) };
});
