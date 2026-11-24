// Plan v3 §1.6: the SSRF guard checks the address at connect time, refuses redirects and never echoes upstream bodies.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BlockedAddressError, guardedFetch, isBlockedAddress } from "../src/server/ssrf";
import { checkBaseUrl, statusError, type ProviderRow } from "../src/server/providers";

describe("isBlockedAddress", () => {
  it("always refuses metadata, link-local and 0/8", () => {
    for (const ip of ["169.254.169.254", "0.0.0.0", "fe80::1", "fd00:ec2::254", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe"]) {
      expect(isBlockedAddress(ip, false), ip).toBe(true);
    }
  });
  it("refuses private ranges only on a hosted install", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.10", "100.100.1.1", "::1", "fd12::1", "::ffff:10.0.0.1", "::ffff:7f00:1"]) {
      expect(isBlockedAddress(ip, true), ip).toBe(true);
      expect(isBlockedAddress(ip, false), ip).toBe(false);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["104.18.2.3", "2606:4700::1111", "172.32.0.1"]) expect(isBlockedAddress(ip, true), ip).toBe(false);
  });
  it("refuses something that is not an IP", () => {
    expect(isBlockedAddress("localhost", false)).toBe(true);
  });
});

describe("guardedFetch", () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        return res.end();
      }
      if (req.url === "/big") {
        res.writeHead(200);
        res.write("x".repeat(64 * 1024));
        return res.end("x".repeat(64 * 1024));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ method: req.method }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  afterEach(() => {
    delete process.env.IZWI_HOSTED;
  });

  it("reaches a local server on a laptop install (Ollama)", async () => {
    const res = await guardedFetch(`http://127.0.0.1:${port}/`, { method: "POST", body: "{}" });
    expect(await res.json()).toEqual({ method: "POST" });
  });

  it("refuses a loopback literal on a hosted install", async () => {
    process.env.IZWI_HOSTED = "1";
    await expect(guardedFetch(`http://127.0.0.1:${port}/`)).rejects.toBeInstanceOf(BlockedAddressError);
  });

  // Rebinding fixture: a name that looks external to a string check but resolves to loopback at connect time.
  it("refuses a hostname that resolves to a private address, checked after DNS", async () => {
    process.env.IZWI_HOSTED = "1";
    await expect(guardedFetch(`http://localhost:${port}/`)).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it("always refuses the metadata address", async () => {
    await expect(guardedFetch("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(guardedFetch("http://[::ffff:169.254.169.254]/")).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it("does not follow redirects", async () => {
    const res = await guardedFetch(`http://127.0.0.1:${port}/redirect`);
    expect(res.status).toBe(302);
  });

  it("stops reading a response over the size cap", async () => {
    const res = await guardedFetch(`http://127.0.0.1:${port}/big`, { maxResponseBytes: 32 * 1024 });
    await expect(res.text()).rejects.toThrow();
  });

  it("refuses non-http schemes", async () => {
    await expect(guardedFetch("file:///etc/passwd")).rejects.toBeInstanceOf(BlockedAddressError);
  });
});

describe("provider addresses and errors", () => {
  it("refuses credentials and query strings in a base URL", () => {
    expect(() => checkBaseUrl("https://user:pass@example.com/v1")).toThrow(/key field/);
    expect(() => checkBaseUrl("https://example.com/v1?key=abc")).toThrow(/\?/);
    expect(checkBaseUrl("https://openrouter.ai/api/v1/")).toBe("https://openrouter.ai/api/v1");
  });
  it("gives fixed messages that never include the upstream body", () => {
    const p = { label: "OpenRouter" } as ProviderRow;
    expect(statusError(p, 401).message).toBe("OpenRouter refused the key.");
    expect(statusError(p, 429).retryable).toBe(true);
    expect(statusError(p, 503).message).toBe("OpenRouter had a problem on its side.");
  });
});
