import { one } from "./db";

export const DEFAULT_PREFERENCES = {
  theme: "approved",
  accent: "amber",
  fontPair: "project",
  textSize: "standard",
  reducedMotion: false,
} as const;

export type UserPreferences = {
  theme: "approved" | "warm" | "high-contrast";
  accent: "amber" | "terracotta" | "forest" | "ocean";
  fontPair: "project" | "clean";
  textSize: "standard" | "large" | "larger";
  reducedMotion: boolean;
};

export async function readUserPreferences(userId: string): Promise<UserPreferences> {
  const row = await one<{ theme: UserPreferences["theme"]; accent: UserPreferences["accent"]; font_pair: UserPreferences["fontPair"]; text_size: UserPreferences["textSize"]; reduced_motion: number }>(
    "SELECT theme, accent, font_pair, text_size, reduced_motion FROM user_preferences WHERE user_id = ?", userId,
  );
  if (!row) return { ...DEFAULT_PREFERENCES };
  return { theme: row.theme, accent: row.accent, fontPair: row.font_pair, textSize: row.text_size, reducedMotion: row.reduced_motion === 1 };
}
