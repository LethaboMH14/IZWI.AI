import { newId, now, one, run } from "./db";
import type { SeasonalIdea } from "@/lib/seasonal-calendar";

export async function seasonalLooksOptedIn(userId: string): Promise<boolean> {
  const row = await one<{ seasonal_looks: number }>("SELECT seasonal_looks FROM user_preferences WHERE user_id = ?", userId);
  return row?.seasonal_looks === 1;
}
export async function setSeasonalLooks(userId: string, enabled: boolean): Promise<void> {
  await run(`INSERT INTO user_preferences (user_id, seasonal_looks, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET seasonal_looks = excluded.seasonal_looks, updated_at = excluded.updated_at`, userId, enabled ? 1 : 0, now());
}
export async function recordSeasonalChoice(workspaceId: string, userId: string, idea: SeasonalIdea, action: "accepted" | "dismissed"): Promise<void> {
  if (action === "accepted") await run(`INSERT INTO user_preferences (user_id, theme, accent, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, accent = excluded.accent, updated_at = excluded.updated_at`, userId, idea.theme, idea.accent, now());
  await run("INSERT INTO seasonal_proposal (id, workspace_id, user_id, seasonal_id, result, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId("sea"), workspaceId, userId, idea.id, action, now());
}
