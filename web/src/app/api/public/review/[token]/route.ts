import { body, route } from "@/server/http";
import { reviewAction, ReviewIn, reviewData } from "@/server/public";

export const runtime = "nodejs";
type P = { token: string };
const ip = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export const GET = route<P>(async (_req, { token }) => reviewData(token));
export const POST = route<P>(async (req, { token }) => reviewAction(token, await body(req, ReviewIn), ip(req)));
