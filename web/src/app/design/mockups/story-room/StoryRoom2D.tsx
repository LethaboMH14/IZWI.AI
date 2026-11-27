// The 2D Story Room: the same room drawn flat, for phones, data saver, reduced motion or no WebGL.
// Same voice crown and five stations, as an SVG with real buttons. No WebGL, a few KB.
import { PILLARS, samplePeaks } from "../sample";

const N = 96;
const r2 = (n: number) => Math.round(n * 100) / 100; // same numbers on server and client
const peaks = samplePeaks(N);

export function StoryRoom2D({ selected, onSelect }: { selected: number; onSelect: (i: number) => void }) {
  return (
    <div className="sr2">
      <svg viewBox="-160 -160 320 320" className="sr2-crown" aria-hidden="true">
        <defs>
          <radialGradient id="sr2-glow">
            <stop offset="0" stopColor="#ffe0a0" />
            <stop offset="1" stopColor="#ffe0a0" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle r="150" fill="url(#sr2-glow)" opacity="0.7" />
        <circle r="118" fill="none" stroke="#B77913" strokeWidth="1" strokeDasharray="2 6" opacity="0.6" />
        {peaks.map((p, i) => {
          const a = (i / N) * Math.PI * 2;
          const r0 = 34, r1 = 34 + 10 + p * 46;
          return (
            <line key={i} x1={r2(Math.sin(a) * r0)} y1={r2(-Math.cos(a) * r0)} x2={r2(Math.sin(a) * r1)} y2={r2(-Math.cos(a) * r1)}
              stroke={p > 0.6 ? "#E9A21B" : "#B77913"} strokeWidth="2.4" strokeLinecap="round" />
          );
        })}
        <circle r="16" fill="#E9A21B" />
      </svg>
      <ol className="sr2-stations">
        {PILLARS.map((p, i) => {
          const a = (i / PILLARS.length) * Math.PI * 2;
          return (
            <li key={p.id} style={{ ["--x" as string]: `${r2(50 + Math.sin(a) * 41)}%`, ["--y" as string]: `${r2(50 - Math.cos(a) * 41)}%`, ["--pc" as string]: p.color }}>
              <button type="button" className={"sr-label" + (i === selected ? " on" : "") + (p.planned ? " planned" : "")} aria-pressed={i === selected} onClick={() => onSelect(i)}>
                <i />
                {p.name}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
