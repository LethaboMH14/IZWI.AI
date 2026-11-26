import { guardedFetch } from "./ssrf";

// AI SDK 7's FetchFunction is `typeof globalThis.fetch`; this adapter keeps that full call shape
// while deliberately supporting only bounded, replayable text and binary request bodies.
export const sdkFetch: typeof fetch = async (input, init) => {
  const source = input instanceof Request ? input : undefined;
  const url = source?.url ?? (input instanceof URL ? input.toString() : input);
  if (typeof url !== "string") throw new TypeError("sdkFetch expects a Request, URL, or URL string.");
  const method = init?.method ?? source?.method ?? "GET";
  const headers = new Headers(source?.headers);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (source?.body && /^(multipart\/form-data|application\/x-www-form-urlencoded)(?:;|$)/i.test(source.headers.get("content-type") ?? "")) {
    throw new TypeError("sdkFetch does not support Request bodies encoded from FormData or URLSearchParams.");
  }
  let body = init?.body;
  if (body === undefined && source?.body) {
    if (source.bodyUsed) throw new TypeError("sdkFetch cannot reuse a consumed Request body.");
    body = new Uint8Array(await source.clone().arrayBuffer());
  }
  if (body !== undefined && body !== null && typeof body !== "string" && !(body instanceof Uint8Array) && !(body instanceof ArrayBuffer)) {
    throw new TypeError("sdkFetch supports only string, Uint8Array, or ArrayBuffer bodies; streams and FormData are not supported.");
  }
  const signal = init?.signal ?? source?.signal;
  return guardedFetch(url, {
    method,
    headers: Object.fromEntries(headers.entries()),
    body: body instanceof ArrayBuffer ? new Uint8Array(body) : body ?? undefined,
    signal: signal ?? undefined,
  });
};
