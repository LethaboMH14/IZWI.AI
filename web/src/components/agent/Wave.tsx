import { envelopeSlice, type TimelineRange } from "@/lib/timeline-math";

const BARS = 56;

/** A mini slice of the recording envelope. Real peaks only: with none, it says so instead of drawing a shape. */
export function Wave({ peaks, range, durationMs, tone, label }: {
  peaks: readonly number[]; range: TimelineRange | null; durationMs: number; tone: "original" | "proposed"; label: string;
}) {
  const slice = range ? envelopeSlice(peaks, range, durationMs) : [];
  if (slice.length === 0) return <span className="ag-wave ag-wave-none" role="img" aria-label={`${label}: not available`}>No envelope</span>;
  const top = Math.max(...peaks, 1e-9);
  const n = Math.min(BARS, slice.length);
  const bars: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * slice.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * slice.length) / n));
    let m = 0;
    for (let j = a; j < b && j < slice.length; j++) m = Math.max(m, Math.abs(slice[j]));
    bars.push(Math.max(0.06, Math.min(1, m / top)));
  }
  return (
    <span className="ag-wave" role="img" aria-label={label} data-tone={tone}>
      {bars.map((h, i) => <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />)}
    </span>
  );
}
