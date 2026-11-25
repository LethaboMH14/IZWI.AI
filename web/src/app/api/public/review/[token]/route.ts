import { body, route } from "@/server/http";
import { clientIp, limit, LIMIT } from "@/server/ratelimit";
import { reviewAction, ReviewIn, reviewData } from "@/server/public";

export const runtime = "nodejs";
type P = { token: string };
const ip = clientIp;

export const GET = route<P>(async (req, { token }) => {
  limit(`review-read:${ip(req)}`, LIMIT.publicRead);
  return reviewData(token);
});
export const POST = route<P>(async (req, { token }) => reviewAction(token, await body(req, ReviewIn), ip(req)));
