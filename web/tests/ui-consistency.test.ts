// Every window uses one palette, one radius scale and one type scale. A literal colour, radius or font size added to a
// product screen fails here, so the look cannot drift from one screen to another. Use the tokens in tokens.css.
// Exempt: the token files themselves, and the dark surfaces the design system allows (Spatial Canvas, Story Room, the
// 3D scene), which draw their own colours on purpose (DESIGN-SYSTEM.md §2).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.join(__dirname, "..", "src");
const EXEMPT = /(tokens\.css|scene3d|spatial|room[\\/]|SpatialCanvas|Strand|layout\.tsx|design[\\/]page|NightBackdrop|RoomScene|StoryRoom)/;
const TOKEN_DEFINITIONS = /^\s*--[a-z0-9-]+:\s*#/; // palette definitions in globals.css are the source of the tokens

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

const files = walk(src).filter((f) => !EXEMPT.test(f));
const lines = (rule: RegExp) =>
  files.flatMap((f) =>
    readFileSync(f, "utf8").split("\n")
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => rule.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l) && !TOKEN_DEFINITIONS.test(l))
      .map(({ l, i }) => `${path.relative(src, f)}:${i + 1} ${l.trim().slice(0, 100)}`),
  );

describe("one look across every screen", () => {
  it("uses no literal colour outside the tokens", () => {
    expect(lines(/#[0-9a-fA-F]{6}\b/)).toEqual([]);
  });

  it("uses no literal border radius: radii come from the scale (4, 6, 8, 10, 12, or a token)", () => {
    expect(lines(/border-radius:\s*\d+(\.\d+)?px/)).toEqual([]);
  });

  it("uses no literal font size: sizes come from the six-step scale or a text token", () => {
    expect(lines(/font-size:\s*(?!var\()[0-9.]+(px|rem)/)).toEqual([]);
  });
});
