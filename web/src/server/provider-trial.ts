import { z } from "zod";
import { lockKey, newId, one, run, tx } from "./db";

const ruleSchema = z.object({
  baseUrl: z.url({ protocol: /^https$/ }).refine((url) => {
    const parsed = new URL(url);
    return !parsed.username && !parsed.password && !parsed.search && !parsed.hash && !url.endsWith("/");
  }),
  model: z.string().min(1).max(200),
  maxRequests: z.number().int().min(1).max(100),
  capMicros: z.number().int().min(0).max(1_000_000),
  maxMicrosPerRequest: z.number().int().min(0).max(1_000_000),
});
const rulesSchema = z.array(ruleSchema).min(1).max(10);
const RESERVATION = "trial_reserved_usd_micros";

export class TrialPolicyError extends Error {}

export function trialEnabled() {
  return process.env.IZWI_PROVIDER_TRIAL === "1";
}

/** Charge the full operator-approved estimate before sending. Unknown charges remain reserved. */
export async function reserveTrialCall(input: { base_url: string; model: string | null; workspace_id: string }, url: string) {
  if (!trialEnabled()) return null;
  let rules: z.infer<typeof rulesSchema>;
  try {
    rules = rulesSchema.parse(JSON.parse(process.env.IZWI_PROVIDER_TRIAL_RULES ?? "[]"));
  } catch {
    throw new TrialPolicyError("The hosted trial has no valid provider policy.");
  }
  const matching = rules.filter((rule) => rule.baseUrl === input.base_url && rule.model === input.model);
  const rule = matching.length === 1 ? matching[0] : undefined;
  if (!rule || url !== `${rule.baseUrl}/chat/completions`) {
    throw new TrialPolicyError("This provider or model is outside the hosted trial policy.");
  }
  const route = JSON.stringify([rule.baseUrl, rule.model]);
  // One reservation at a time per route, so two requests can never both pass the cap.
  return tx(async () => {
    await lockKey(`trial:${route}`);
    const usage = (await one<{ requests: number; micros: number }>(
      "SELECT COUNT(*) AS requests, COALESCE(SUM(amount), 0) AS micros FROM usage_event WHERE unit = ? AND provider = ?",
      RESERVATION, route,
    ))!;
    if (usage.requests >= rule.maxRequests || usage.micros + rule.maxMicrosPerRequest > rule.capMicros) {
      throw new TrialPolicyError("The hosted trial request or spending cap has been reached.");
    }
    const id = newId("trial");
    await addUsage(id, input.workspace_id, RESERVATION, rule.maxMicrosPerRequest, route);
    return { id, route, workspaceId: input.workspace_id };
  });
}

type Receipt = NonNullable<Awaited<ReturnType<typeof reserveTrialCall>>>;

export async function recordTrialTokens(receipt: Receipt | null, input: unknown, output: unknown) {
  if (!receipt) return;
  for (const [unit, count] of [["trial_input_tokens", input], ["trial_output_tokens", output]] as const) {
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) {
      await addUsage(`${receipt.id}:${unit}`, receipt.workspaceId, unit, count, receipt.route);
    }
  }
}

async function addUsage(id: string, workspaceId: string, unit: string, amount: number, provider: string) {
  await run(
    "INSERT INTO usage_event (id, workspace_id, unit, amount, provider, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id, workspaceId, unit, amount, provider, id, Date.now(),
  );
}
