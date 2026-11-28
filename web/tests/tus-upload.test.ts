// The browser's resumable upload, run with the real tus client against the real route handler, so a client that no
// longer reports progress or completion fails here and not in front of a person. Only the session lookup is replaced.
import "./helpers/testdb";
import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { Upload } from "tus-js-client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { tusOptions } from "../src/lib/tus-options";
import { sessionFor } from "./helpers/api";

const hoisted = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("../src/server/auth", () => ({ auth: { api: { getSession: async () => hoisted.session } } }));

let db: Db;
let server: Server;
let origin = "";

beforeAll(async () => {
  db = await openTestDb();
  await seedWorkspace(db, "org_tus", "usr_tus", "prj_tus");
  hoisted.session = sessionFor("usr_tus", "org_tus");
  const route = await import("../src/app/api/upload/[[...tus]]/route");
  server = createServer(async (req, res) => {
    const headers = new Headers(Object.entries(req.headers).map(([k, v]): [string, string] => [k, String(v)]));
    headers.set("origin", origin);
    const method = req.method as keyof typeof route;
    const init: RequestInit & { duplex?: "half" } = { method: req.method, headers };
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method!)) Object.assign(init, { body: Readable.toWeb(req), duplex: "half" });
    const out = await (route[method] as (r: Request) => Promise<Response>)(new Request(`${origin}${req.url}`, init));
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, 60_000);
afterAll(async () => { server.close(); await closeTestDb(db); });

it("reports progress and completion, and leaves one source file behind", async () => {
  // A WAV header followed by silence: enough for the type check on the stored bytes.
  const bytes = Buffer.concat([Buffer.from("RIFF0000WAVE"), Buffer.alloc(4096)]);
  const progress: [number, number][] = [];
  await new Promise<void>((resolve, reject) => {
    const options = tusOptions("prj_tus", { name: "note.wav", type: "audio/wav" }, { onProgress: (sent, total) => progress.push([sent, total]), onSuccess: resolve, onError: reject });
    new Upload(bytes as never, { ...options, endpoint: `${origin}/api/upload`, fingerprint: async () => "test", retryDelays: [] }).start();
  });
  expect(progress.at(-1)).toEqual([bytes.length, bytes.length]);
  expect(await db.all(`SELECT filename, bytes FROM asset WHERE project_id = 'prj_tus'`)).toEqual([{ filename: "note.wav", bytes: bytes.length }]);
}, 30_000);
