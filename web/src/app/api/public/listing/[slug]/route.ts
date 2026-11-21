import { body, route } from "@/server/http";
import { enquire, EnquiryIn, listingData } from "@/server/public";

export const runtime = "nodejs";
type P = { slug: string };
const ip = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export const GET = route<P>(async (_req, { slug }) => listingData(slug));
export const POST = route<P>(async (req, { slug }) => enquire(slug, await body(req, EnquiryIn), ip(req)));
