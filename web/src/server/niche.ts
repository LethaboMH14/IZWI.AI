import { one, run, now } from "./db";
import { CREATOR_NICHES, type CreatorNiche } from "@/lib/niche-tips";

export async function readCreatorNiche(userId: string): Promise<CreatorNiche> {
  const row = await one<{ creator_niche: string }>("SELECT creator_niche FROM user_preferences WHERE user_id = ?", userId);
  return CREATOR_NICHES.includes(row?.creator_niche as CreatorNiche) ? row!.creator_niche as CreatorNiche : "podcast";
}

export async function saveCreatorNiche(userId: string, niche: CreatorNiche): Promise<void> {
  await run(`INSERT INTO user_preferences (user_id, creator_niche, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET creator_niche = excluded.creator_niche, updated_at = excluded.updated_at`, userId, niche, now());
}
