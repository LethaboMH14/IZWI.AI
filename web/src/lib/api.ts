"use client";
// One way to call the IZWI API from the browser: JSON in and out, readable errors, and an Idempotency-Key per
// user action so a double click or a network retry never creates a second job.

export class ApiError extends Error {
  constructor(public status: number, message: string, public issues?: { path: string; message: string }[]) {
    super(message);
  }
}

export function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; key?: string; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["idempotency-key"] = opts.key ?? newKey();
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: opts.signal, credentials: "same-origin" });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "No connection. Check your signal and try again.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string; issues?: { path: string; message: string }[] };
    throw new ApiError(res.status, d.error ?? d.message ?? `Request failed (${res.status}).`, d.issues);
  }
  return data as T;
}

// WhatsApp share without a phone number: opens WhatsApp with the message ready to send to anyone.
export const whatsappLink = (message: string) => `https://wa.me/?text=${encodeURIComponent(message)}`;
