import { useReducedMotion, type Variants } from "motion/react";

const easeOut = [0.2, 0.8, 0.2, 1] as const;

export const enterStagger = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04 } },
  },
  item: {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: easeOut } },
  },
} satisfies Record<string, Variants>;

export const lift = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.98 },
  transition: { duration: 0.18, ease: easeOut },
};

export const fadeThrough: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18, ease: easeOut } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: easeOut } },
};

/** Pure mapper so reduced-motion behavior can be checked without rendering React. */
export function mapReducedMotion(variants: Variants, reduced: boolean): Variants {
  if (!reduced) return variants;
  return Object.fromEntries(
    Object.entries(variants).map(([key, value]) => {
      if (typeof value !== "object" || value === null) return [key, value];
      const target = { ...value };
      if ("y" in target) target.y = 0;
      if ("x" in target) target.x = 0;
      if ("scale" in target) target.scale = 1;
      return [key, target];
    }),
  ) as Variants;
}

export function useReducedMotionSafe(variants: Variants): Variants {
  return mapReducedMotion(variants, Boolean(useReducedMotion()));
}
