import { one } from "./db";
import { GREETINGS } from "@/lib/greetings";

export async function readCreatorLanguages(userId: string): Promise<string[]> {
  const row = await one<{ languages: string }>("SELECT languages FROM user_preferences WHERE user_id = ?", userId);
  if (!row) return ["en"];
  try {
    const selected = JSON.parse(row.languages) as unknown;
    if (!Array.isArray(selected)) return ["en"];
    const valid = selected.filter((id): id is string => typeof id === "string" && GREETINGS.some((item) => item.id === id));
    return valid.length ? valid : ["en"];
  } catch { return ["en"]; }
}
