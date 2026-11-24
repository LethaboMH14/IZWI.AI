// What a stored file really is. The server decides the type from an extension allowlist plus the file's first bytes;
// the browser's claimed MIME type and the uploaded filename's extension are never trusted for storage or serving.
// ffprobe checks the streams afterwards in the probe step.

type Family = "isobmff" | "matroska" | "riff-avi" | "riff-wave" | "mp3" | "adts" | "ogg" | "flac";

const BY_EXT: Record<string, { family: Family; mime: string }> = {
  mp4: { family: "isobmff", mime: "video/mp4" },
  m4v: { family: "isobmff", mime: "video/mp4" },
  mov: { family: "isobmff", mime: "video/quicktime" },
  "3gp": { family: "isobmff", mime: "video/3gpp" },
  m4a: { family: "isobmff", mime: "audio/mp4" },
  webm: { family: "matroska", mime: "video/webm" },
  mkv: { family: "matroska", mime: "video/x-matroska" },
  avi: { family: "riff-avi", mime: "video/x-msvideo" },
  wav: { family: "riff-wave", mime: "audio/wav" },
  mp3: { family: "mp3", mime: "audio/mpeg" },
  aac: { family: "adts", mime: "audio/aac" },
  ogg: { family: "ogg", mime: "audio/ogg" },
  opus: { family: "ogg", mime: "audio/ogg" },
  flac: { family: "flac", mime: "audio/flac" },
};

export function uploadExt(filename: string): string | null {
  const m = /\.([A-Za-z0-9]{2,4})$/.exec(filename.trim());
  const ext = m?.[1].toLowerCase();
  return ext && ext in BY_EXT ? ext : null;
}

export function sniffFamily(head: Uint8Array): Family | null {
  const at = (o: number, s: string) => head.length >= o + s.length && [...s].every((ch, i) => head[o + i] === ch.charCodeAt(0));
  if (at(4, "ftyp")) return "isobmff";
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "matroska";
  if (at(0, "RIFF") && at(8, "AVI ")) return "riff-avi";
  if (at(0, "RIFF") && at(8, "WAVE")) return "riff-wave";
  if (at(0, "OggS")) return "ogg";
  if (at(0, "fLaC")) return "flac";
  if (at(0, "ID3")) return "mp3";
  if (head.length >= 2 && head[0] === 0xff) {
    if ((head[1] & 0xf6) === 0xf0) return "adts"; // AAC ADTS sync word, layer 00
    if ((head[1] & 0xe0) === 0xe0) return "mp3"; // MPEG audio frame sync
  }
  return null;
}

// The type to store, or null to refuse. The extension says what was meant; the bytes must agree with it.
export function verifiedType(filename: string, head: Uint8Array): { ext: string; mime: string } | null {
  const ext = uploadExt(filename);
  if (!ext) return null;
  const want = BY_EXT[ext];
  const got = sniffFamily(head);
  if (got !== want.family) return null;
  // An ADTS stream named .mp3 (or the reverse) is still audio, but keep the stored type honest.
  return { ext, mime: want.mime };
}

// Serving: media plays inline; anything else is a download with a neutral type, so stored bytes can never run as a page.
const INLINE = /^(video\/[\w.+-]+|audio\/[\w.+-]+|image\/(jpeg|png))$/;
const DOWNLOAD_AS_IS = new Set(["application/json", "application/zip", "text/vtt", "application/x-subrip"]);

export function servedType(storedMime: string): { mime: string; inline: boolean } {
  const m = storedMime.toLowerCase().split(";")[0].trim();
  if (INLINE.test(m)) return { mime: m, inline: true };
  return { mime: DOWNLOAD_AS_IS.has(m) ? m : "application/octet-stream", inline: false };
}

// Set on every stored-file response, in the route itself: /api/media does not pass through the page proxy.
export const STORED_FILE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
};
