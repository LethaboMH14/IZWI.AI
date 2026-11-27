import { expect, it } from "vitest";
import { formatDuration, formatTime } from "../src/lib/timecode";

it("formats minutes and seconds", () => {
  expect(formatTime(0)).toBe("00:00");
  expect(formatTime(14000)).toBe("00:14");
  expect(formatTime(79000)).toBe("01:19");
  expect(formatTime(14999)).toBe("00:14");
});
it("adds hours automatically from one hour", () => {
  expect(formatTime(3723000)).toBe("1:02:03");
  expect(formatTime(3599000)).toBe("59:59");
});
it("can always show hours", () => {
  expect(formatTime(14000, { hours: "always" })).toBe("0:00:14");
  expect(formatTime(3723000, { hours: "always" })).toBe("1:02:03");
});
it("shows tenths, truncating", () => {
  expect(formatTime(14250, { tenths: true })).toBe("00:14.2");
  expect(formatTime(14999, { tenths: true })).toBe("00:14.9");
  expect(formatTime(3723400, { tenths: true })).toBe("1:02:03.4");
  expect(formatTime(0, { tenths: true, hours: "always" })).toBe("0:00:00.0");
});
it("returns --:-- for negative, NaN and infinite times", () => {
  expect(formatTime(-1)).toBe("--:--");
  expect(formatTime(NaN)).toBe("--:--");
  expect(formatTime(Infinity)).toBe("--:--");
  expect(formatDuration(-5)).toBe("--:--");
  expect(formatDuration(NaN)).toBe("--:--");
});
it("formats durations", () => {
  expect(formatDuration(0)).toBe("0s");
  expect(formatDuration(36000)).toBe("36s");
  expect(formatDuration(59999)).toBe("59s");
  expect(formatDuration(60000)).toBe("1:00");
  expect(formatDuration(79000)).toBe("1:19");
  expect(formatDuration(3723000)).toBe("1:02:03");
});
