import { body, route } from "@/server/http";
import { consentAction, ConsentIn, consentData } from "@/server/public";

export const runtime = "nodejs";
type P = { token: string };
const ip = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export const GET = route<P>(async (_req, { token }) => consentData(token));
export const POST = route<P>(async (req, { token }) => consentAction(token, await body(req, ConsentIn), ip(req), req.headers.get("user-agent") ?? ""));
