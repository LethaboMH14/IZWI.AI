// WCAG 2.1 contrast for the text colours the interface uses on its surfaces (AA: 4.5:1 for body text, 3:1 for large text).
// Reads the colour tokens from the stylesheets, so a token change that breaks a pair fails here.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(__dirname, "..", "src", "app");
const css = ["globals.css", "tokens.css"].map((f) => readFileSync(path.join(root, f), "utf8")).join("\n");
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Text roles on the working surfaces, with the minimum ratio each must meet.
const pairs: [string, string, string, number][] = [
  ["ink on paper (public body text)", "ink", "paper", 4.5],
  ["ink-2 on paper (public secondary text)", "ink-2", "paper", 4.5],
  ["muted on paper (public captions)", "muted", "paper", 4.5],
  ["muted on sand (public cards)", "muted", "sand", 4.5],
  ["amber-deep on paper (public links)", "amber-deep", "paper", 4.5],
  ["z-ink on z-ivory-0 (studio text)", "z-ink", "z-ivory-0", 4.5],
  ["z-ink-muted on z-ivory-0 (studio secondary)", "z-ink-muted", "z-ivory-0", 4.5],
  ["z-shell-text on z-shell-page (shell text)", "z-shell-text", "z-shell-page", 4.5],
  ["z-shell-muted on z-shell-page (shell secondary)", "z-shell-muted", "z-shell-page", 4.5],
];

describe("text contrast (WCAG AA)", () => {
  for (const [label, fg, bg, min] of pairs) {
    it(`${label} is at least ${min}:1`, () => {
      const r = ratio(token(fg), token(bg));
      expect(r, `${fg} ${token(fg)} on ${bg} ${token(bg)} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(min);
    });
  }
});
