import { newId, now, one, run } from "./db";
import { privacyOf, type ProviderRow } from "./providers";

// Rates are integer cents per million tokens. Add only reviewed, versioned price sources here.
export const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {};

export function priceFor(model: string, provider?: Pick<ProviderRow, "kind" | "base_url">): { in: number; out: number } | null {
  if (provider && privacyOf(provider) === "private") return { in: 0, out: 0 };
  if (model.endsWith(":free")) return { in: 0, out: 0 };
  return PRICE_PER_MTOK[model] ?? null;
}

export type Usage = { input: number; output: number };
export type BudgetReceipt = {
  id: string; workspaceId: string; day: string; reservedTokens: number; reservedCents: number;
  inputTokens: number; requestBytes: number; maxOutputTokens: number; price: { in: number; out: number };
  settled: boolean;
};

export class BudgetError extends Error {}

const dayKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const centsFor = (input: number, output: number, price: { in: number; out: number }) =>
  Math.ceil((input * price.in + output * price.out) / 1_000_000);

export function reserveAttempt(args: {
  workspaceId: string; userId: string; providerId: string; model: string;
  provider?: Pick<ProviderRow, "kind" | "base_url">;
  serializedRequestBytes: number; maxOutputTokens: number;
}): BudgetReceipt {
  if (!Number.isSafeInteger(args.serializedRequestBytes) || args.serializedRequestBytes < 0 ||
      !Number.isSafeInteger(args.maxOutputTokens) || args.maxOutputTokens < 0) throw new BudgetError("Invalid assistant budget estimate.");
  const price = priceFor(args.model, args.provider);
  if (!price) throw new BudgetError("This model has no approved price entry.");
  // R10'': for a byte-level BPE, no token can cover fewer than one UTF-8 byte,
  // so the request body's UTF-8 byte count is a conservative input-token upper bound.
  const inputTokens = args.serializedRequestBytes;
  const tokens = inputTokens + args.maxOutputTokens;
  const cents = centsFor(inputTokens, args.maxOutputTokens, price);
  const tokenCap = Number(process.env.IZWI_ASSISTANT_DAILY_TOKENS ?? 200_000);
  const centsCap = Number(process.env.IZWI_ASSISTANT_DAILY_CENTS ?? 0);
  const day = dayKey(now());
  // One SQLite upsert atomically checks both caps and reserves both amounts; no read-then-write race.
  const inserted = one<{ workspace_id: string }>(
    `INSERT INTO assistant_budget (workspace_id, day, tokens_reserved, cents_reserved)
     SELECT ?, ?, ?, ? WHERE ? <= ? AND ? <= ?
     ON CONFLICT(workspace_id, day) DO UPDATE SET
       tokens_reserved = assistant_budget.tokens_reserved + excluded.tokens_reserved,
       cents_reserved = assistant_budget.cents_reserved + excluded.cents_reserved
     WHERE assistant_budget.tokens_reserved + assistant_budget.tokens_used + excluded.tokens_reserved <= ?
       AND assistant_budget.cents_reserved + assistant_budget.cents_used + excluded.cents_reserved <= ?
     RETURNING workspace_id`,
    args.workspaceId, day, tokens, cents, tokens, tokenCap, cents, centsCap, tokenCap, centsCap,
  );
  if (!inserted) throw new BudgetError("The workspace daily assistant budget is exhausted.");
  return { id: newId("asst_res"), workspaceId: args.workspaceId, day, reservedTokens: tokens,
    reservedCents: cents, inputTokens, requestBytes: args.serializedRequestBytes, maxOutputTokens: args.maxOutputTokens, price, settled: false };
}

export function settleAttempt(receipt: BudgetReceipt, usage: Usage | null): void {
  if (receipt.settled) return;
  const actual = usage ?? { input: receipt.inputTokens, output: receipt.maxOutputTokens };
  if (![actual.input, actual.output].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new BudgetError("Invalid assistant usage.");
  const chargedTokens = actual.input + actual.output;
  const chargedCents = centsFor(actual.input, actual.output, receipt.price);
  const changed = run(
    `UPDATE assistant_budget SET tokens_reserved = MAX(0, tokens_reserved - ?),
       cents_reserved = MAX(0, cents_reserved - ?), tokens_used = tokens_used + ?, cents_used = cents_used + ?
     WHERE workspace_id = ? AND day = ? AND tokens_reserved >= ? AND cents_reserved >= ?`,
    receipt.reservedTokens, receipt.reservedCents, chargedTokens, chargedCents,
    receipt.workspaceId, receipt.day, receipt.reservedTokens, receipt.reservedCents,
  ).changes;
  if (!changed) throw new BudgetError("The assistant reservation could not be settled.");
  receipt.settled = true;
}

const LEASE_MS = 60_000;

export function acquireLease(userId: string, workspaceId: string): boolean {
  const t = now();
  return Boolean(one<{ user_id: string }>(
    `INSERT INTO assistant_lease (user_id, workspace_id, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET workspace_id = excluded.workspace_id, expires_at = excluded.expires_at
     WHERE assistant_lease.expires_at <= ? RETURNING user_id`, userId, workspaceId, t + LEASE_MS, t,
  ));
}

export function renewLease(userId: string, workspaceId: string): boolean {
  return run(`UPDATE assistant_lease SET expires_at = ? WHERE user_id = ? AND workspace_id = ? AND expires_at > ?`,
    now() + LEASE_MS, userId, workspaceId, now()).changes > 0;
}

export function releaseLease(userId: string, workspaceId: string): boolean {
  return run(`DELETE FROM assistant_lease WHERE user_id = ? AND workspace_id = ?`, userId, workspaceId).changes > 0;
}
