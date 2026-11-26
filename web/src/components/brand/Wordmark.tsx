// The IZWI mark: seven amber voice bars (8, 16, 24, 33, 24, 16, 8) beside "IZWI AI" in Fraunces.
// The word is live text so it stays sharp and selectable; the bars are an inline SVG so they take no request.
import Link from "next/link";

const BARS = [
  { x: 4.5, y: 16, h: 8 }, { x: 9.5, y: 12, h: 16 }, { x: 14.5, y: 8, h: 24 }, { x: 19.5, y: 3.5, h: 33 },
  { x: 24.5, y: 8, h: 24 }, { x: 29.5, y: 12, h: 16 }, { x: 34.5, y: 16, h: 8 },
];

export function Bars({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <g fill="var(--z-amber)">
        {BARS.map((b) => <rect key={b.x} x={b.x} y={b.y} width={3} height={b.h} rx={1.5} />)}
      </g>
    </svg>
  );
}

export function Wordmark({ href, size = 26 }: { href?: string; size?: number }) {
  const body = (
    <>
      <Bars size={size} />
      <span className="z-wordmark-text">IZWI AI</span>
    </>
  );
  return href ? (
    <Link href={href} className="z-wordmark" aria-label="IZWI AI, stories">{body}</Link>
  ) : (
    <span className="z-wordmark">{body}</span>
  );
}
