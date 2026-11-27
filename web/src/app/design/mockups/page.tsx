// Index of the v3 design mockups (Lethabo's review on PR #1: agree the look before lanes B and D build).
import Link from "next/link";
import { Mark } from "@/components/Mark";
import "./mockups.css";

const items = [
  { href: "/design/mockups/story-room", name: "Story Room · 3D", note: "Landing. Drag, scroll or tap to turn the room." },
  { href: "/design/mockups/story-room?mode=2d", name: "Story Room · 2D fallback", note: "What phones, data saver and reduced motion get." },
  { href: "/design/mockups/rights-map", name: "Rights map · 2D (default)", note: "People → clips → outputs. Try “Simulate Sipho's yes”." },
  { href: "/design/mockups/rights-map?view=3d", name: "Rights map · 3D sketch", note: "Optional upgrade, first in the cut order." },
];

export default function Mockups() {
  return (
    <main className="mk">
      <Mark small />
      <h1>Design mockups</h1>
      <p>Interactive mockups for plan v3 §4: the 3D environment and its 2D fallbacks. Sample data only. Splash, studio with assistant, phone consent, /pricing and /trust follow.</p>
      <div className="mk-grid">
        {items.map((i) => (
          <Link key={i.href} href={i.href}>
            <span className="mono">{i.href.replace("/design/mockups/", "")}</span>
            <b>{i.name}</b>
            <span>{i.note}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
