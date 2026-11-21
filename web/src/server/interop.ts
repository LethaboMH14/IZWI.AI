// Hand-offs to the editors creators already use.
// CMX 3600 EDL and OpenTimelineIO both import into DaVinci Resolve; OTIO also opens in Kdenlive and other OTIO tools.
// Validated by reading them back with the OpenTimelineIO library (tests/interop-check.py).
type ClipRef = { title: string; startMs: number; endMs: number; reason?: string };
const pad = (n: number) => String(n).padStart(2, "0");

export function timecode(ms: number, fps: number) {
  const f = Math.round(fps);
  const total = Math.round((ms / 1000) * f);
  const frames = total % f;
  const s = Math.floor(total / f);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(frames)}`;
}

const reel = (name: string) => (name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) || "AX").padEnd(8, " ");

export function toEDL(title: string, sourceName: string, clips: ClipRef[], fps: number) {
  const out = [`TITLE: ${title.replace(/[\r\n]+/g, " ").slice(0, 70)}`, "FCM: NON-DROP FRAME", ""];
  let rec = 3600 * 1000;
  clips.forEach((c, i) => {
    const dur = c.endMs - c.startMs;
    out.push(`${String(i + 1).padStart(3, "0")}  ${reel(sourceName)} AA/V  C        ${timecode(c.startMs, fps)} ${timecode(c.endMs, fps)} ${timecode(rec, fps)} ${timecode(rec + dur, fps)}`);
    out.push(`* FROM CLIP NAME: ${sourceName}`);
    out.push(`* COMMENT: ${c.title.replace(/[\r\n]+/g, " ").slice(0, 120)}`);
    out.push("");
    rec += dur;
  });
  return out.join("\n");
}

const rt = (ms: number, fps: number) => ({ OTIO_SCHEMA: "RationalTime.1", rate: Math.round(fps), value: Math.round((ms / 1000) * Math.round(fps)) });
const range = (startMs: number, durMs: number, fps: number) => ({ OTIO_SCHEMA: "TimeRange.1", duration: rt(durMs, fps), start_time: rt(startMs, fps) });

export function toOTIO(o: { title: string; sourceName: string; durationMs: number; fps: number; hasVideo: boolean; hasAudio: boolean; clips: ClipRef[] }) {
  const clip = (c: ClipRef) => ({
    OTIO_SCHEMA: "Clip.2",
    metadata: { izwi: { reason: c.reason ?? "" } },
    name: c.title,
    source_range: range(c.startMs, c.endMs - c.startMs, o.fps),
    effects: [],
    markers: [],
    enabled: true,
    media_references: {
      DEFAULT_MEDIA: { OTIO_SCHEMA: "ExternalReference.1", metadata: {}, name: o.sourceName, available_range: range(0, o.durationMs, o.fps), available_image_bounds: null, target_url: o.sourceName },
    },
    active_media_reference_key: "DEFAULT_MEDIA",
  });
  const track = (kind: "Video" | "Audio", name: string) => ({ OTIO_SCHEMA: "Track.1", metadata: {}, name, source_range: null, effects: [], markers: [], enabled: true, children: o.clips.map(clip), kind });
  const tracks = [o.hasVideo ? track("Video", "V1") : null, o.hasAudio ? track("Audio", "A1") : null].filter(Boolean);
  return {
    OTIO_SCHEMA: "Timeline.1",
    metadata: { izwi: { exported_by: "IZWI AI", note: "Relink the source file in your editor if it is not found." } },
    name: o.title,
    global_start_time: rt(3600 * 1000, o.fps),
    tracks: { OTIO_SCHEMA: "Stack.1", metadata: {}, name: "tracks", source_range: null, effects: [], markers: [], enabled: true, children: tracks },
  };
}
