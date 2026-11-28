import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { seasonalLooksEnabled } from "@/server/flags";
import { seasonalLooksOptedIn, setSeasonalLooks } from "@/server/seasonal";
export const runtime = "nodejs";
function enabled() { if (!seasonalLooksEnabled()) fail(404, "Not found."); }
export const GET = route(async () => { enabled(); const ctx = await requireCtx(); return { enabled: await seasonalLooksOptedIn(ctx.userId) }; });
export const PATCH = route(async (req) => { enabled(); const ctx = await requireCtx(); const input = await body(req, z.object({ enabled: z.boolean() }).strict()); await setSeasonalLooks(ctx.userId, input.enabled); return { enabled: input.enabled }; });
