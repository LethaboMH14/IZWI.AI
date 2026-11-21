// Plain names for the project kinds the API accepts (see KINDS in src/server/actions.ts).
export const KIND_LABEL: Record<string, string> = {
  podcast: "Podcast", video: "Video", lesson: "Lesson", music: "Music", film: "Film", animation: "Animation", client: "Client work",
};
export const KIND_ORDER = ["podcast", "video", "lesson", "music", "film", "animation", "client"] as const;
