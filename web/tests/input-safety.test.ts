// Values people can put in a URL or a form must not send anyone off this site or run as script.
import { describe, expect, it } from "vitest";
import { safeNext } from "../src/lib/safe-next";
import { PostedIn } from "../src/server/actions";

describe("the page to open after sign-in", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/.//evil.example", "/..//evil.example", "javascript:alert(1)", "app", "", null])(
    "never leaves this site: %j", (raw) => expect(safeNext(raw)).toBe("/app"));
  it.each(["/app", "/welcome", "/invite/abc123", "/app/p/prj_1/protect?tab=people#top"])("keeps a path on this site: %s", (raw) => expect(safeNext(raw)).toBe(raw));
});

describe("a recorded post link", () => {
  it("accepts web addresses only", () => {
    expect(PostedIn.safeParse({ platform: "YouTube", url: "https://youtu.be/abc" }).success).toBe(true);
    expect(PostedIn.safeParse({ platform: "YouTube" }).success).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd", "not a link"]) {
      expect(PostedIn.safeParse({ platform: "YouTube", url }).success, url).toBe(false);
    }
  });
});
