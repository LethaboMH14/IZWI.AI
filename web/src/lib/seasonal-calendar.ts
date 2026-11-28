export type SeasonalIdea = { id: string; name: string; window: string; theme: "approved" | "warm" | "high-contrast"; accent: "amber" | "terracotta" | "forest" | "ocean"; ideas: readonly string[] };
export const SEASONAL_CALENDAR: readonly SeasonalIdea[] = [
  { id: "summer", name: "South African summer", window: "December to February", theme: "warm", accent: "amber", ideas: ["Plan a short outdoor story with shade and clear audio.", "Prepare a low-data version for mobile sharing."] },
  { id: "winter", name: "South African winter", window: "June to August", theme: "warm", accent: "terracotta", ideas: ["Tell a local winter routine or recipe story.", "Check indoor light and room echo before recording."] },
  { id: "heritage-day", name: "Heritage Day", window: "24 September", theme: "approved", accent: "forest", ideas: ["Invite people to share a story in their own words.", "Confirm pronunciation, attribution and consent before sharing names."] },
  { id: "youth-day", name: "Youth Day", window: "16 June", theme: "warm", accent: "ocean", ideas: ["Ask young people what they want audiences to hear.", "Let participants review their quotes before publication."] },
  { id: "womens-day", name: "Women's Day", window: "9 August", theme: "approved", accent: "terracotta", ideas: ["Share a person's work with their permission and preferred name.", "Ask contributors how they want their voices credited."] },
  { id: "festive-season", name: "Festive season", window: "15 November to 10 January", theme: "warm", accent: "forest", ideas: ["Make a short year-end reflection with one specific moment.", "Check music and guest permissions before reuse."] },
  { id: "back-to-school", name: "Back to school", window: "January to February", theme: "approved", accent: "ocean", ideas: ["Explain one useful school routine or concept.", "Keep student names and faces private unless you have consent."] },
];

const md = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
};
export function seasonalSuggestion(date = new Date()): SeasonalIdea {
  const day = md(date);
  if (day === "09-24") return SEASONAL_CALENDAR.find((x) => x.id === "heritage-day")!;
  if (day === "06-16") return SEASONAL_CALENDAR.find((x) => x.id === "youth-day")!;
  if (day === "08-09") return SEASONAL_CALENDAR.find((x) => x.id === "womens-day")!;
  if ((day >= "01-10" && day <= "02-15") || (day >= "07-01" && day <= "07-20")) return SEASONAL_CALENDAR.find((x) => x.id === "back-to-school")!;
  if (day >= "11-15" || day <= "01-10") return SEASONAL_CALENDAR.find((x) => x.id === "festive-season")!;
  if (day >= "12-01" || day <= "02-28") return SEASONAL_CALENDAR.find((x) => x.id === "summer")!;
  return SEASONAL_CALENDAR.find((x) => x.id === "winter")!;
}
