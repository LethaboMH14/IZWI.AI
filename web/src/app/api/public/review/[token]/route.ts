import { body, route } from "@/server/http";
import { clientIp, limit, LIMIT } from "@/server/ratelimit";
import { reviewAction, ReviewIn, reviewData } from "@/server/public";

export const runtime = "nodejs";
type P = { token: string };
const ip = clientIp;

export const GET = route<P>(async (req, { token }) => {
  await limit(`review-read:${ip(req)}`, LIMIT.publicRead);
  return await reviewData(token);
});
export const POST = route<P>(async (req, { token }) => await reviewAction(token, await body(req, ReviewIn), ip(req)));
