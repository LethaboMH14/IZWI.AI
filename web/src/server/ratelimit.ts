// Fixed-window rate limits kept in Postgres, so they hold across restarts and across serverless instances.
// One short UPSERT per check, outside any long transaction.
// Kept dependency-free on purpose; rate-limiter-flexible was the plan's option and can replace this behind the same call.
import { one, run } from "./db";
import { HttpError } from "./http";

export class RateLimitError extends HttpError {
  constructor(public retryAfterSec: number) {
    super(429, "Too many requests. Wait a minute and try again.");
  }
}

// Behind the tunnel the socket address is the tunnel's, so the forwarded header is the only signal. It is trusted only
// when IZWI_TRUST_PROXY=1; otherwise anyone could pick their own bucket by sending the header.
export function clientIp(req: Request): string {
  if (process.env.IZWI_TRUST_PROXY !== "1") return "direct";
  // On Vercel the platform sets x-forwarded-for itself; cf-connecting-ip there would come from the client and could be forged.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0];
  const h = process.env.VERCEL ? forwarded : req.headers.get("cf-connecting-ip") ?? forwarded;
  const ip = h?.trim();
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : "unknown";
}

export async function rateLimit(key: string, max: number, windowMs: number): Promise<void> {
  const t = Date.now();
  const start = Math.floor(t / windowMs) * windowMs;
  const r = (await one<{ count: number }>(
    `INSERT INTO rate_limit (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET count = CASE WHEN rate_limit.window_start = excluded.window_start THEN rate_limit.count + 1 ELSE 1 END,
                                    window_start = excluded.window_start
     RETURNING count`,
    key.slice(0, 200), start,
  ))!;
  if (Math.random() < 0.01) await run(`DELETE FROM rate_limit WHERE window_start < ?`, t - 24 * 3600_000);
  if (r!.count > max) throw new RateLimitError(Math.max(1, Math.ceil((start + windowMs - t) / 1000)));
}

// Named limits, so routes and tests agree on the numbers. Per minute unless the window says otherwise.
export const LIMIT = {
  publicRead: { max: 120, windowMs: 60_000 },
  publicWrite: { max: 20, windowMs: 60_000 },
  consentPerLink: { max: 10, windowMs: 3600_000 },
  enquiry: { max: 5, windowMs: 10 * 60_000 },
  plan: { max: 20, windowMs: 60_000 },
  providerTest: { max: 10, windowMs: 60_000 },
  uploadCreate: { max: 30, windowMs: 3600_000 },
  assistant: { max: 10, windowMs: 60_000 },
  assistantDay: { max: 100, windowMs: 24 * 3600_000 },
  voice: { max: 6, windowMs: 60_000 },
} as const;

export const limit = (key: string, l: { max: number; windowMs: number }) => rateLimit(key, l.max, l.windowMs);
