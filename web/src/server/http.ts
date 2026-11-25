// One wrapper for every API route: same-origin check on writes, typed errors, no stack traces to clients.
import { ZodError } from "zod";
import { PUBLIC_URL, STUDIO_URL } from "./env";

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

// Writes must prove they come from our own pages: a matching Origin, or, when a browser leaves Origin out,
// Sec-Fetch-Site: same-origin. A request with neither is refused, so a missing header is never a way round the check.
export function checkOrigin(req: Request) {
  const requestOrigin = new URL(req.url).origin;
  const allowed = new Set([new URL(PUBLIC_URL).origin, STUDIO_URL]);
  if (process.env.IZWI_HOSTED !== "1") allowed.add(requestOrigin);
  if (process.env.IZWI_HOSTED === "1" && !allowed.has(requestOrigin)) {
    throw new HttpError(403, "Request host is not configured.");
  }
  const origin = req.headers.get("origin");
  if (origin) {
    if (!allowed.has(origin) || (process.env.IZWI_HOSTED === "1" && origin !== requestOrigin)) {
      throw new HttpError(403, "Cross-site request refused.");
    }
    return;
  }
  if (req.headers.get("sec-fetch-site") === "same-origin") return;
  throw new HttpError(403, "Cross-site request refused.");
}

export function toResponse(e: unknown) {
  if (e instanceof HttpError) {
    const retry = (e as HttpError & { retryAfterSec?: number }).retryAfterSec;
    return Response.json({ error: e.message }, { status: e.status, headers: retry ? { "Retry-After": String(retry) } : undefined });
  }
  if (e instanceof ZodError) {
    return Response.json(
      { error: "Some fields are not valid.", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  console.error("[izwi] unhandled API error", e instanceof Error ? e.name : "unknown");
  return Response.json({ error: "Something went wrong on our side. It has been logged." }, { status: 500 });
}

export const MAX_JSON_BYTES = 64 * 1024;

// Reads at most `max` bytes, whatever Content-Length claims, so a large or endless body cannot fill memory.
export async function readCapped(req: Request, max: number): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) throw new HttpError(413, "This request is too large.");
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "This request is too large.");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function body<T>(req: Request, schema: { parse(v: unknown): T }, maxBytes = MAX_JSON_BYTES): Promise<T> {
  const text = await readCapped(req, maxBytes);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Send a JSON body.");
  }
  return schema.parse(raw);
}
