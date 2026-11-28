// Where to send someone after sign-in: a path on this site, or the studio. A browser drops tabs and newlines from a
// URL and folds "/.//" into "//", so checking the first characters of the raw value is not enough.
const HERE = "https://this-site.invalid";

export function safeNext(raw: string | null | undefined): string {
  if (!raw?.startsWith("/")) return "/app";
  const url = new URL(raw, HERE);
  const path = url.pathname + url.search + url.hash;
  return url.origin === HERE && !path.startsWith("//") ? path : "/app";
}
