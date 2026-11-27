import { body, route } from "@/server/http";
import { clientIp, limit, LIMIT } from "@/server/ratelimit";
import { enquire, EnquiryIn, listingData } from "@/server/public";

export const runtime = "nodejs";
type P = { slug: string };
const ip = clientIp;

export const GET = route<P>(async (req, { slug }) => {
  await limit(`listing-read:${ip(req)}`, LIMIT.publicRead);
  return await listingData(slug);
});
export const POST = route<P>(async (req, { slug }) => await enquire(slug, await body(req, EnquiryIn), ip(req)));
