import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

type DraftText = (toolName: string, output: unknown) => string[];
let draftText: DraftText;

// The route module pulls in the AI SDK and the database, so the first import is slow on a laptop.
beforeAll(async () => {
  ({ draftText } = await import("../src/app/api/projects/[id]/assistant/route"));
}, 60_000);

// Found in the browser walkthrough: a small local model answered with only a draftTitles tool call, so the
// creator saw an empty reply. Draft tool results must become visible text.
describe("assistant reply text from draft tools", () => {
  it("turns draft titles into a visible list", () => {
    expect(draftText("draftTitles", { titles: ["Taxi rank mornings", "  ", "Sharp sharp"] })).toEqual([
      "Draft titles:",
      "- Taxi rank mornings",
      "- Sharp sharp",
    ]);
  });

  it("turns a draft caption and post into visible lines", () => {
    expect(draftText("draftCaptionPost", { caption: "Sawubona Mzansi!", post: "New episode out now." })).toEqual([
      "Draft caption: Sawubona Mzansi!",
      "Draft post: New episode out now.",
    ]);
  });

  it("ignores proposal tools and malformed output", () => {
    expect(draftText("keepClip", { clipId: "c1" })).toEqual([]);
    expect(draftText("draftTitles", { titles: "not a list" })).toEqual([]);
    expect(draftText("draftCaptionPost", null)).toEqual([]);
  });
});
