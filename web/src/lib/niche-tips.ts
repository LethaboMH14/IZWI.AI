export const CREATOR_NICHES = ["podcast", "wedding", "music", "comedy", "cooking", "school", "community", "review"] as const;
export type CreatorNiche = (typeof CREATOR_NICHES)[number];
export const NICHE_LABEL: Record<CreatorNiche, string> = { podcast: "Podcast", wedding: "Wedding", music: "Music", comedy: "Comedy", cooking: "Cooking", school: "School explainer", community: "Community event", review: "Product review" };
export const NICHE_TIPS: Record<CreatorNiche, readonly string[]> = {
  podcast: ["Write one listener question for each episode before recording.", "Mark a short quote and its surrounding context so a clip keeps its meaning."],
  wedding: ["Confirm who may be filmed and where the couple wants the video shared.", "Keep a copy of the final edit for the couple before posting a public cut."],
  music: ["Confirm composition, master and performer permissions for each recording.", "Capture a clean room tone and a short check of the loudest section."],
  comedy: ["Check that a short clip keeps the setup as well as the punchline.", "Ask before using audience reactions that make a guest identifiable."],
  cooking: ["Show ingredient quantities on screen and check them against your recipe.", "Capture a close-up of the finished dish before the first step."],
  school: ["Put the learning question first, then explain one example at a time.", "Use large, high-contrast labels and read them aloud for accessibility."],
  community: ["Confirm location, event date and permission before naming attendees.", "Include the organiser's approved contact or next-event details."],
  review: ["State how long you used the product and what you tested.", "Disclose gifted products, sponsorship or other paid relationships."],
};
