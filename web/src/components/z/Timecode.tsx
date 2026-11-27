import { formatDuration, formatTime } from "@/lib/timecode";

export function Timecode({ ms, tenths, hours, duration }: {
  ms: number;
  tenths?: boolean;
  hours?: "auto" | "always";
  /** Render as a duration ("36s", "1:19") instead of a clock time. */
  duration?: boolean;
}) {
  const text = duration ? formatDuration(ms) : formatTime(ms, { tenths, hours });
  const ok = Number.isFinite(ms) && ms >= 0;
  const iso = ok ? `PT${(Math.floor(ms) / 1000).toFixed(3)}S` : undefined;
  return <time className="z-time" dateTime={iso}>{text}</time>;
}
