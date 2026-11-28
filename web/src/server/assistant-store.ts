import { run } from "./db";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Project deletion is handled by the migration's project/thread/message ON DELETE CASCADE chain.
export async function purgeOldAssistantMessages(): Promise<number> {
  const cutoff = Date.now() - RETENTION_MS;
  return (await run(`DELETE FROM assistant_message WHERE created_at < ?`, cutoff)).changes;
}
