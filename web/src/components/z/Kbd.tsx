import type { ReactNode } from "react";

export function Kbd({ children, tone }: { children: ReactNode; tone?: "shell" }) {
  return <kbd className={`z-kbd${tone === "shell" ? " z-kbd-shell" : ""}`}>{children}</kbd>;
}
