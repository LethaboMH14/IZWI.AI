const BAD = "--:--";
const pad = (n: number) => String(n).padStart(2, "0");

function valid(ms: number): boolean {
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0;
}

/** "00:14", "01:19", "1:02:03" (hours auto), "00:14.2" (tenths). Negative or NaN gives "--:--". */
export function formatTime(ms: number, opts: { hours?: "auto" | "always"; tenths?: boolean } = {}): string {
  if (!valid(ms)) return BAD;
  const { hours = "auto", tenths = false } = opts;
  const totalTenths = Math.floor(ms / 100);
  const totalSec = Math.floor(totalTenths / 10);
  const t = totalTenths % 10;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const body = h > 0 || hours === "always" ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return tenths ? `${body}.${t}` : body;
}

/** "36s", "1:19" (60 s or more), "1:02:03". Negative or NaN gives "--:--". */
export function formatDuration(ms: number): string {
  if (!valid(ms)) return BAD;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
