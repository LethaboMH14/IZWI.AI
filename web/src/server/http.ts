// One wrapper for every API route: same-origin check on writes, typed errors, no stack traces to clients.
import { ZodError } from "zod";
import { PUBLIC_URL } from "./env";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

type Ctx<P> = { params: Promise<P> };

export function route<P = Record<string, string>>(handler: (req: Request, params: P) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") checkOrigin(req);
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await handler(req, params);
      if (out instanceof Response) return out;
      return Response.json(out ?? { ok: true });
    } catch (e) {
      return toResponse(e);
    }
  };
}

function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // Non-browser clients still need a valid session or token.
  const allowed = new Set([PUBLIC_URL, new URL(req.url).origin]);
  if (!allowed.has(origin)) throw new HttpError(403, "Cross-site request refused.");
}

export function toResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) {
    return Response.json(
      { error: "Some fields are not valid.", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  console.error("[izwi] unhandled", e);
  return Response.json({ error: "Something went wrong on our side. It has been logged." }, { status: 500 });
}

export async function body<T>(req: Request, schema: { parse(v: unknown): T }): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Send a JSON body.");
  }
  return schema.parse(raw);
}
