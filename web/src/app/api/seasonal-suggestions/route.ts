import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { seasonalLooksEnabled } from "@/server/flags";
import { seasonalSuggestion } from "@/lib/seasonal-calendar";
import { recordSeasonalChoice, seasonalLooksOptedIn } from "@/server/seasonal";

export const runtime = "nodejs";
export const GET = route(async () => {
  if (!seasonalLooksEnabled()) return { enabled: false };
  const ctx = await requireCtx();
  return { enabled: await seasonalLooksOptedIn(ctx.userId), suggestion: seasonalSuggestion() };
});
export const POST = route(async (req) => {
  if (!seasonalLooksEnabled()) fail(404, "Not found.");
  const ctx = await requireCtx();
  if (!await seasonalLooksOptedIn(ctx.userId)) fail(403, "Turn on seasonal suggestions in Settings first.");
  const input = await body(req, z.object({ seasonalId: z.string().min(1), action: z.enum(["accept", "dismiss"]) }).strict());
  const idea = seasonalSuggestion();
  if (input.seasonalId !== idea.id) fail(409, "This seasonal suggestion has expired.");
  await recordSeasonalChoice(ctx.workspaceId, ctx.userId, idea, input.action === "accept" ? "accepted" : "dismissed");
  return { status: input.action === "accept" ? "accepted" : "dismissed", applied: input.action === "accept", message: input.action === "accept" ? "Seasonal look applied after your approval." : "Seasonal suggestion dismissed." };
});
