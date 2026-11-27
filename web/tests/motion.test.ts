import { describe, expect, it } from "vitest";
import { mapReducedMotion } from "../src/lib/motion";

describe("mapReducedMotion", () => {
  const variants = {
    hidden: { opacity: 0, y: 6, x: -4, scale: 0.98 },
    visible: { opacity: 1, y: 0, x: 0, scale: 1 },
  };

  it("removes movement and scale changes when reduced motion is requested", () => {
    expect(mapReducedMotion(variants, true)).toEqual({
      hidden: { opacity: 0, y: 0, x: 0, scale: 1 },
      visible: { opacity: 1, y: 0, x: 0, scale: 1 },
    });
  });

  it("preserves the original motion when reduced motion is off", () => {
    expect(mapReducedMotion(variants, false)).toBe(variants);
  });
});
