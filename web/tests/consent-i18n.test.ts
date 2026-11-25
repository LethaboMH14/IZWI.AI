import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { renderSVG, encode } from "uqr";
import { CONSENT_KEYS, ENGLISH, LANGUAGES, STATEMENT_LANG, availableLanguages, consentStrings, fill, missingKeys, segments } from "../src/lib/consent-i18n";

it("offers only reviewed languages, which today is English alone", () => {
  expect(availableLanguages().map((l) => l.id)).toEqual(["en"]);
  expect(() => consentStrings("zu")).toThrow(/not reviewed/);
  expect(() => consentStrings("tn")).toThrow(/not reviewed/);
});

it("English has every key with real text", () => {
  expect(missingKeys("en")).toEqual([]);
  for (const k of CONSENT_KEYS) expect(ENGLISH[k].trim().length, k).toBeGreaterThan(0);
  expect(LANGUAGES.map((l) => l.id)).toEqual(["en", "zu", "tn"]);
});

it("keeps the recorded statement in English and out of the string table", () => {
  expect(STATEMENT_LANG).toBe("en");
  expect(ENGLISH.statementNote).toMatch(/English/);
  const src = readFileSync(new URL("../src/app/c/[token]/ConsentClient.tsx", import.meta.url), "utf8");
  expect(src).toMatch(/<blockquote className="gx-quote" lang=\{STATEMENT_LANG\}>\{data\.statement\}<\/blockquote>/);
  for (const k of CONSENT_KEYS) expect(ENGLISH[k], k).not.toMatch(/\bI, \{/);
});

it("fills placeholders and throws on a missing value", () => {
  expect(fill(ENGLISH.headline, { creator: "Naledi" })).toBe("Naledi is asking for your permission");
  expect(() => fill(ENGLISH.headline, {})).toThrow(/creator/);
  expect(segments("a **b** c")).toEqual([{ text: "a ", bold: false }, { text: "b", bold: true }, { text: " c", bold: false }]);
});

it("renders a consent link as a valid SVG QR with a module grid", () => {
  const url = "https://izwi.example/c/abcdefghijklmnopqrstuvwx";
  const svg = renderSVG(url, { ecc: "M", border: 0, blackColor: "#211e1a", whiteColor: "#faf8f4" });
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  expect(svg).toContain("#211e1a");
  expect(svg).toContain("#faf8f4");
  const { size, data } = encode(url, { ecc: "M", border: 0 });
  expect(size).toBeGreaterThanOrEqual(21);
  expect(data.length).toBe(size);
  expect(data.flat().some(Boolean)).toBe(true);
  expect(svg).toMatch(new RegExp(`viewBox="0 0 ${size * 10} ${size * 10}"`));
});
