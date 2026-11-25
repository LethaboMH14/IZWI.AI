// Display helpers shared by every screen.
export function clock(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "--:--";
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function bytes(n: number | null | undefined) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

export function ago(t: number | null | undefined) {
  if (!t) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export const JOB_LABEL: Record<string, string> = {
  probe: "Reading the file", proxy: "Making a light preview", transcribe: "Listening", suggest_clips: "Finding clips",
  translate: "Translating", render: "Rendering", package: "Building the package",
};

export const media = (assetId: string, extra = "") => `/api/media/${assetId}${extra}`;
export const rand = (cents: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
