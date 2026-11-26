// Plan v3 §1.1, §1.3, §1.4: HTML-as-MP4 rejection, safe serving, origin checks on writes, JSON body caps.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { servedType, sniffFamily, STORED_FILE_HEADERS, verifiedType } from "../src/server/filetype";
import { body, checkOrigin, HttpError, readCapped } from "../src/server/http";
import { z } from "zod";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("verifiedType", () => {
  const mp4 = bytes([0, 0, 0, 0x20], "ftypisom", [0, 0, 2, 0]);
  it("accepts real media whose bytes match the extension", () => {
    expect(verifiedType("episode.MP4", mp4)).toEqual({ ext: "mp4", mime: "video/mp4" });
    expect(verifiedType("a.webm", bytes([0x1a, 0x45, 0xdf, 0xa3]))).toEqual({ ext: "webm", mime: "video/webm" });
    expect(verifiedType("a.wav", bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toEqual({ ext: "wav", mime: "audio/wav" });
    expect(verifiedType("a.mp3", bytes("ID3", [3, 0]))).toEqual({ ext: "mp3", mime: "audio/mpeg" });
    expect(verifiedType("a.mp3", bytes([0xff, 0xfb, 0x90]))).toEqual({ ext: "mp3", mime: "audio/mpeg" });
    expect(verifiedType("a.aac", bytes([0xff, 0xf1, 0x50]))).toEqual({ ext: "aac", mime: "audio/aac" });
  });

  it("refuses an HTML page named .mp4", () => {
    expect(verifiedType("clip.mp4", bytes("<!doctype html><script>alert(1)</script>"))).toBeNull();
  });

  it("refuses names off the list, whatever the bytes", () => {
    expect(verifiedType("page.html", mp4)).toBeNull();
    expect(verifiedType("clip.mp4.html", mp4)).toBeNull();
    expect(verifiedType("noext", mp4)).toBeNull();
  });

  it("refuses bytes of a different container than the name", () => {
    expect(verifiedType("clip.webm", mp4)).toBeNull();
    expect(sniffFamily(bytes("GIF89a"))).toBeNull();
  });
});

describe("servedType", () => {
  it("plays media inline and turns everything else into a neutral download", () => {
    expect(servedType("video/mp4")).toEqual({ mime: "video/mp4", inline: true });
    expect(servedType("image/png")).toEqual({ mime: "image/png", inline: true });
    expect(servedType("text/html")).toEqual({ mime: "application/octet-stream", inline: false });
    expect(servedType("image/svg+xml")).toEqual({ mime: "application/octet-stream", inline: false });
    expect(servedType("application/json")).toEqual({ mime: "application/json", inline: false });
  });

  it("sandboxes every stored file", () => {
    expect(STORED_FILE_HEADERS["Content-Security-Policy"]).toMatch(/^sandbox/);
    expect(STORED_FILE_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(STORED_FILE_HEADERS["Cross-Origin-Resource-Policy"]).toBe("same-origin");
  });
});

describe("checkOrigin", () => {
  const req = (h: Record<string, string>) => new Request("http://localhost:3187/api/projects", { method: "POST", headers: h });
  it("allows our own origin", () => {
    expect(() => checkOrigin(req({ origin: "http://localhost:3187" }))).not.toThrow();
  });
  it("allows a same-origin fetch that sent no Origin", () => {
    expect(() => checkOrigin(req({ "sec-fetch-site": "same-origin" }))).not.toThrow();
  });
  it("refuses another site", () => {
    expect(() => checkOrigin(req({ origin: "https://evil.example" }))).toThrow(HttpError);
  });
  it("refuses a write with neither header", () => {
    expect(() => checkOrigin(req({}))).toThrow(/Cross-site/);
    expect(() => checkOrigin(req({ "sec-fetch-site": "cross-site" }))).toThrow(/Cross-site/);
  });
});

describe("checkOrigin on a hosted install", () => {
  // Behind a tunnel, Next builds req.url from the address it listens on; the public hostname arrives only in Host.
  const via = (host: string, headers: Record<string, string>) =>
    new Request("https://127.0.0.1:3187/api/projects", { method: "POST", headers: { host, ...headers } });
  let hosted: typeof import("../src/server/http");
  beforeAll(async () => {
    vi.stubEnv("IZWI_HOSTED", "1");
    vi.stubEnv("IZWI_PUBLIC_URL", "https://consent.izwi.test");
    vi.stubEnv("BETTER_AUTH_URL", "https://studio.izwi.test");
    vi.resetModules();
    hosted = await import("../src/server/http");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("allows a write on each configured hostname", () => {
    expect(() => hosted.checkOrigin(via("consent.izwi.test", { origin: "https://consent.izwi.test" }))).not.toThrow();
    expect(() => hosted.checkOrigin(via("Studio.IZWI.test", { origin: "https://studio.izwi.test" }))).not.toThrow();
    expect(() => hosted.checkOrigin(via("studio.izwi.test", { "sec-fetch-site": "same-origin" }))).not.toThrow();
  });
  it("refuses one configured hostname writing to the other", () => {
    expect(() => hosted.checkOrigin(via("studio.izwi.test", { origin: "https://consent.izwi.test" }))).toThrow(/Cross-site/);
  });
  it("refuses another site, a plain-http Origin and a write with neither header", () => {
    expect(() => hosted.checkOrigin(via("consent.izwi.test", { origin: "https://evil.example" }))).toThrow(/Cross-site/);
    expect(() => hosted.checkOrigin(via("consent.izwi.test", { origin: "http://consent.izwi.test" }))).toThrow(/Cross-site/);
    expect(() => hosted.checkOrigin(via("consent.izwi.test", {}))).toThrow(/Cross-site/);
  });
  it("refuses a host that is not configured, including the listen address", () => {
    expect(() => hosted.checkOrigin(via("evil.example", { origin: "https://evil.example" }))).toThrow(/not configured/);
    expect(() => hosted.checkOrigin(via("evil.example", { origin: "https://consent.izwi.test" }))).toThrow(/not configured/);
    expect(() => hosted.checkOrigin(via("127.0.0.1:3187", { origin: "https://127.0.0.1:3187" }))).toThrow(/not configured/);
  });
});

describe("JSON body cap", () => {
  const post = (b: string | ReadableStream, h: Record<string, string> = {}) =>
    new Request("http://localhost/x", { method: "POST", body: b, headers: h, duplex: "half" } as RequestInit);

  it("parses a normal body", async () => {
    expect(await body(post(JSON.stringify({ a: 1 })), z.object({ a: z.number() }))).toEqual({ a: 1 });
  });
  it("refuses a body over 64 KB with 413", async () => {
    const big = JSON.stringify({ a: "x".repeat(70 * 1024) });
    await expect(body(post(big), z.any())).rejects.toMatchObject({ status: 413 });
  });
  it("stops reading a stream that lies about its length", async () => {
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(c) {
        sent += 16 * 1024;
        c.enqueue(new Uint8Array(16 * 1024).fill(32));
      },
    });
    await expect(readCapped(post(endless, { "content-length": "10" }), 64 * 1024)).rejects.toMatchObject({ status: 413 });
    expect(sent).toBeLessThan(200 * 1024);
  });
  it("answers 400 for something that is not JSON", async () => {
    await expect(body(post("not json"), z.any())).rejects.toMatchObject({ status: 400 });
  });
});
