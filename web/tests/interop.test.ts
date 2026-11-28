// Hand-offs to other editors: timecodes and the EDL that DaVinci Resolve and similar tools read.
import { describe, expect, it } from "vitest";
import { timecode, toEDL } from "../src/server/interop";

describe("timecode", () => {
  it("counts frames at 25 fps and rolls over each second", () => {
    expect(timecode(0, 25)).toBe("00:00:00:00");
    expect(timecode(40, 25)).toBe("00:00:00:01");
    expect(timecode(960, 25)).toBe("00:00:00:24");
    expect(timecode(1000, 25)).toBe("00:00:01:00");
  });

  it("snaps to the nearest frame, so 999 ms (24.975 frames) reads as the next second", () => {
    expect(timecode(999, 25)).toBe("00:00:01:00");
  });

  it("carries minutes and hours", () => {
    expect(timecode(61_000, 25)).toBe("00:01:01:00");
    expect(timecode(3_600_000 + 2_000, 25)).toBe("01:00:02:00");
  });

  it("rounds a fractional frame rate to whole frames", () => {
    expect(timecode(1000, 29.97)).toBe("00:00:01:00");
  });
});

describe("toEDL", () => {
  const clips = [
    { title: "One phone and a borrowed mic", startMs: 18_000, endMs: 46_000, reason: "" },
    { title: "Make this city sing", startMs: 248_000, endMs: 291_000, reason: "" },
  ];

  it("writes a title, a non-drop-frame header and one event per clip", () => {
    const edl = toEDL("Episode 04", "episode_04.mp4", clips, 25);
    const lines = edl.split("\n");
    expect(lines[0]).toBe("TITLE: Episode 04");
    expect(lines[1]).toBe("FCM: NON-DROP FRAME");
    expect(edl.match(/^\d{3}  /gm)).toHaveLength(2);
  });

  it("places the source in and out points and records the clips back to back", () => {
    const edl = toEDL("Episode 04", "episode_04.mp4", clips, 25);
    expect(edl).toContain("00:00:18:00 00:00:46:00 01:00:00:00 01:00:28:00");
    expect(edl).toContain("00:04:08:00 00:04:51:00 01:00:28:00 01:01:11:00");
  });

  it("keeps the title and comments on one line each", () => {
    const edl = toEDL("Line one\nLine two", "a.mp4", [{ title: "A\rB", startMs: 0, endMs: 1000, reason: "" }], 25);
    expect(edl.split("\n")[0]).toBe("TITLE: Line one Line two");
    expect(edl).toContain("* COMMENT: A B");
  });
});
