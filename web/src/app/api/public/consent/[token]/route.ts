import { body, route } from "@/server/http";
import { clientIp, limit, LIMIT } from "@/server/ratelimit";
import { consentAction, ConsentIn, consentData } from "@/server/public";

export const runtime = "nodejs";
type P = { token: string };
const ip = clientIp;

export const GET = route<P>(async (req, { token }) => {
  await limit(`consent-read:${ip(req)}`, LIMIT.publicRead);
  return await consentData(token);
});
export const POST = route<P>(async (req, { token }) => await consentAction(token, await body(req, ConsentIn), ip(req), req.headers.get("user-agent") ?? ""));
