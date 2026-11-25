// Every outbound provider call goes through guardedFetch. The address is checked when the socket connects, after DNS,
// so a hostname that resolves (or re-resolves) to a private address is refused: no DNS-rebinding window.
// Cloud metadata and link-local addresses are always refused. Loopback and private ranges are refused when
// IZWI_HOSTED=1; a laptop install keeps them so local Ollama works. Redirects are never followed.
// Built on node:http(s) and net.BlockList, so it adds no dependency.
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import { Readable, Transform } from "node:stream";

export class BlockedAddressError extends Error {
  constructor() {
    super("That address is not allowed.");
  }
}

function list(ranges: [string, number, "ipv4" | "ipv6"][], addrs: [string, "ipv4" | "ipv6"][] = []) {
  const b = new net.BlockList();
  for (const [a, p, t] of ranges) b.addSubnet(a, p, t);
  for (const [a, t] of addrs) b.addAddress(a, t);
  return b;
}

const ALWAYS = list(
  [
    ["0.0.0.0", 8, "ipv4"],
    ["169.254.0.0", 16, "ipv4"], // link-local, including 169.254.169.254 cloud metadata
    ["fe80::", 10, "ipv6"],
  ],
  [["fd00:ec2::254", "ipv6"], ["::", "ipv6"]],
);

const PRIVATE = list([
  ["127.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["100.64.0.0", 10, "ipv4"], // carrier-grade NAT, also Tailscale
  ["192.0.0.0", 24, "ipv4"],
  ["198.18.0.0", 15, "ipv4"],
  ["224.0.0.0", 4, "ipv4"],
  ["240.0.0.0", 4, "ipv4"],
  ["::1", 128, "ipv6"],
  ["fc00::", 7, "ipv6"],
  ["ff00::", 8, "ipv6"],
]);

export const hostedMode = () => process.env.IZWI_HOSTED === "1";

export function isBlockedAddress(ip: string, hosted = hostedMode()): boolean {
  let addr = ip.replace(/^\[|\]$/g, "").toLowerCase();
  // IPv4-mapped IPv6 (::ffff:10.0.0.1, or its hex form) is checked as the IPv4 address it carries.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) addr = mapped[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr);
  if (hex) {
    const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
    addr = [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
  }
  const family = net.isIPv4(addr) ? "ipv4" : net.isIPv6(addr) ? "ipv6" : null;
  if (!family) return true; // not an IP at all: refuse rather than guess
  if (ALWAYS.check(addr, family)) return true;
  return hosted && PRIVATE.check(addr, family);
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

// Same signature as dns.lookup; refuses as soon as any resolved address is on the list.
export function guardedLookup(hostname: string, options: dns.LookupOptions, cb: LookupCb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) return cb(new BlockedAddressError(), "");
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

export type GuardedInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
  maxResponseBytes?: number;
};

// A small fetch: enough for JSON and streamed provider APIs. Returns a web Response; 3xx comes back as-is, never followed.
export function guardedFetch(url: string, init: GuardedInit = {}): Promise<Response> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") return Promise.reject(new BlockedAddressError());
  const literal = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(literal) && isBlockedAddress(literal)) return Promise.reject(new BlockedAddressError());
  const mod = u.protocol === "https:" ? https : http;
  const max = init.maxResponseBytes ?? 16 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      u,
      { method: init.method ?? "GET", headers: init.headers, lookup: guardedLookup as unknown as net.LookupFunction, signal: init.signal },
      (res) => {
        let seen = 0;
        const counted = new Transform({
          transform(c: Buffer, _enc, done) {
            seen += c.length;
            if (seen > max) return done(new Error("The provider sent more data than IZWI accepts."));
            done(null, c);
          },
        });
        res.on("error", (e) => counted.destroy(e));
        res.pipe(counted);
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        const status = res.statusCode ?? 502;
        // Statuses that must not carry a body (Fetch spec "null body status"); building a Response with one throws.
        const nullBody = status === 101 || status === 103 || status === 204 || status === 205 || status === 304 || (init.method ?? "GET") === "HEAD";
        try {
          resolve(new Response(nullBody ? null : (Readable.toWeb(counted) as ReadableStream), { status, headers }));
        } catch (e) {
          // An unusual upstream status must reject the call, never throw inside this callback and crash the process.
          res.destroy();
          counted.destroy();
          reject(e);
        }
      },
    );
    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}
