import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sdkFetch } from "../src/server/sdk-fetch";

describe("sdkFetch", () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => res.end(JSON.stringify({ method: req.method, header: req.headers["x-test"], body: Buffer.concat(chunks).toString() })));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("adapts Headers, tuple, and record headers with text and binary bodies", async () => {
    const url = `http://127.0.0.1:${port}/`;
    for (const headers of [new Headers({ "x-test": "headers" }), [["x-test", "tuples"]] as [string, string][], { "x-test": "record" }]) {
      const res = await sdkFetch(url, { method: "POST", headers, body: "text" });
      expect(await res.json()).toMatchObject({ method: "POST", body: "text" });
    }
    for (const body of [new TextEncoder().encode("bytes"), new TextEncoder().encode("arraybuffer").buffer]) {
      const res = await sdkFetch(url, { method: "POST", body });
      expect((await res.json()).body).toMatch(/^(bytes|arraybuffer)$/);
    }
  });

  it("accepts Request and URL inputs and clearly rejects unbounded body types", async () => {
    const url = new URL(`http://127.0.0.1:${port}/`);
    expect(await (await sdkFetch(url)).json()).toMatchObject({ method: "GET" });
    expect(await (await sdkFetch(new Request(url, { method: "POST", body: "request" }))).json()).toMatchObject({ body: "request" });
    await expect(sdkFetch(new Request(url, { method: "POST", body: new FormData() }))).rejects.toThrow(/FormData/);
    await expect(sdkFetch(url, { method: "POST", body: new FormData() })).rejects.toThrow(/streams and FormData/);
    await expect(sdkFetch(url, { method: "POST", body: new ReadableStream() })).rejects.toThrow(/streams and FormData/);
  });
});
