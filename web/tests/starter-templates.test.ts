import { expect, it } from "vitest";
import { STARTER_TEMPLATES } from "../src/lib/starter-templates";

it("covers all requested creator niches with editable patterns and no performance claims", () => {
  expect(STARTER_TEMPLATES.map((template) => template.niche)).toEqual(["Podcast", "Wedding", "Music", "Comedy", "Cooking", "School explainer", "Community event", "Product review"]);
  for (const template of STARTER_TEMPLATES) {
    expect(template.titlePattern.length).toBeGreaterThan(0);
    expect(template.descriptionPattern.length).toBeGreaterThan(0);
    expect(template.clipSeconds).toBeGreaterThan(0);
    expect(["vertical", "square", "wide"]).toContain(template.aspect);
  }
  expect(JSON.stringify(STARTER_TEMPLATES)).not.toMatch(/views|earnings|revenue/i);
});
