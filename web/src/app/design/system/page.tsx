// The live reference for the design system (docs/design/DESIGN-SYSTEM.md): type ramp, surfaces and every
// primitive in every state, rendered with the real fonts and tokens.
import { Gallery } from "@/components/z";

const RAMP = [
  { name: "display · Fraunces 40", cls: "display", size: 40, text: "Start before you are ready" },
  { name: "title-l · Fraunces 28", cls: "display", size: 28, text: "Tighter opening" },
  { name: "title-s · Fraunces 20", cls: "display", size: 20, text: "IZWI Editing Agent" },
  { name: "body · Instrument Sans 14", cls: "ui", size: 14, text: "You have to start before you are ready." },
  { name: "ui · Instrument Sans 14", cls: "ui", size: 14, text: "Request consent · Render vertical · Apply edit" },
  { name: "meta · Instrument Sans 12", cls: "ui", size: 12, text: "sim_jozi-stories-ep04.mp4 · 1280×720 · 1.4 MB" },
  { name: "micro · Instrument Sans 12", cls: "ui", size: 12, text: "Story Room · Rights map · Outputs" },
  { name: "time · Geist Mono 12", cls: "mono", size: 12, text: "00:14 / 00:48 · 00:12 – 00:48 (36s)" },
];
const FAMILY: Record<string, string> = { display: "var(--z-font-display)", ui: "var(--z-font-ui)", mono: "var(--z-font-mono)" };

export default function DesignSystemPage() {
  return (
    <main style={{ background: "var(--z-shell-page)", minHeight: "100dvh", padding: "clamp(12px, 4vw, 32px)", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 24, fontFamily: "var(--z-font-ui)" }}>
      <section aria-label="Type" style={{ background: "var(--z-ivory-0)", borderRadius: 12, padding: "clamp(14px, 3vw, 24px)", minWidth: 0, color: "var(--z-ink)" }}>
        <h1 style={{ margin: "0 0 16px", font: "650 22px/1.2 var(--z-font-display)", letterSpacing: 0 }}>IZWI AI design system</h1>
        {RAMP.map((r) => (
          <div key={r.name} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", alignItems: "baseline", gap: 16, padding: "8px 0", borderTop: "1px solid var(--z-ivory-line)" }}>
            <span style={{ fontSize: 12, color: "var(--z-ink-muted)", fontFamily: "var(--z-font-mono)" }}>{r.name}</span>
            <span style={{ fontFamily: FAMILY[r.cls], fontSize: r.size, fontWeight: r.cls === "display" ? 650 : 400, fontVariantNumeric: "tabular-nums" }}>{r.text}</span>
          </div>
        ))}
      </section>
      <Gallery />
    </main>
  );
}
