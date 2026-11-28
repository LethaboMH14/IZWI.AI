import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { homeTipsEnabled } from "@/server/flags";
import { saveCreatorNiche, readCreatorNiche } from "@/server/niche";
import { CREATOR_NICHES, NICHE_TIPS } from "@/lib/niche-tips";

export const runtime = "nodejs";
const Input = z.object({ niche: z.enum(CREATOR_NICHES) }).strict();
function enabled() { if (!homeTipsEnabled()) fail(404, "Not found."); }
export const GET = route(async () => {
  enabled(); const ctx = await requireCtx(); const niche = await readCreatorNiche(ctx.userId);
  return { niche, tips: NICHE_TIPS[niche], youtubeConnected: false, inspiration: [], note: "Connect your own YouTube account with read-only access before IZWI can search for inspiration. YouTube account connection is not available yet." };
});
export const PATCH = route(async (req) => {
  enabled(); const ctx = await requireCtx(); const { niche } = await body(req, Input);
  await saveCreatorNiche(ctx.userId, niche);
  return { niche, tips: NICHE_TIPS[niche] };
});
