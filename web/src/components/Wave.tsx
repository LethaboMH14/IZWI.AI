import { waveform } from "@/lib/demo";

type Region = { start: number; end: number; active?: boolean };

// Real recordings pass `data` (peaks, 0 to 1). Without it the picture is a seeded sample, which the landing page and onboarding use.
export function Wave({ n, height = 56, progress = 0, regions = [], seed = 7, data, label }: { n?: number; height?: number; progress?: number; regions?: Region[]; seed?: number; data?: number[]; label?: string }) {
  const real = !!data && data.length > 0;
  const bars = n ?? (real ? Math.min(data.length, 360) : 160);
  const values = real ? bin(data, bars) : waveform(bars, seed);
  return (
    <svg className="wave" viewBox={`0 0 ${bars * 4} ${height}`} preserveAspectRatio="none" role="img" aria-label={label ?? (real ? "Audio waveform of the recording" : "Audio waveform of the episode")}>
      {regions.map((r, i) => (
        <rect key={i} className={"wave-region" + (r.active ? " on" : "")} x={r.start * bars * 4} width={Math.max(0, r.end - r.start) * bars * 4} y="0" height={height} rx="6" />
      ))}
      {values.map((v, i) => {
        const h = Math.max(2, v * (height - 8));
        const x = i / bars;
        const inClip = regions.some((r) => x >= r.start && x <= r.end);
        return <rect key={i} className={(x <= progress ? "played " : "") + (inClip ? "clip" : "")} x={i * 4 + 0.8} y={(height - h) / 2} width="2.4" height={h} rx="1.2" />;
      })}
      <rect className="wave-head" x={Math.min(1, Math.max(0, progress)) * bars * 4 - 1} y="0" width="2" height={height} rx="1" />
    </svg>
  );
}

// Keep the loudest peak of each bucket so a short loud word never disappears when the picture is narrower than the data.
function bin(data: number[], bars: number) {
  if (data.length <= bars) return data;
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const a = Math.floor((i / bars) * data.length), b = Math.max(a + 1, Math.floor(((i + 1) / bars) * data.length));
    let m = 0;
    for (let j = a; j < b; j++) if (data[j] > m) m = data[j];
    out.push(m);
  }
  return out;
}
