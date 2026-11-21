"use client";
// Small pieces shared by the Localise, Protect, Publish and Earn tabs.
import { useCallback, useState } from "react";
import { ApiError, api, whatsappLink } from "@/lib/api";
import "@/app/stages.css";

export type ActError = { status: number; message: string };

/** Run one write, keep a busy flag and an inline error. Returns the result, or undefined if it failed. */
export function useAct(refresh: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ActError | null>(null);
  const act = useCallback(
    async <T,>(name: string, method: string, url: string, body?: unknown): Promise<T | undefined> => {
      setBusy(name);
      setError(null);
      try {
        const r = await api<T>(url, { method, body });
        await refresh();
        return (r ?? {}) as T;
      } catch (e) {
        const x = e as ApiError;
        setError({ status: x.status ?? 0, message: x.message || "Something went wrong." });
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );
  return { act, busy, error, setError };
}

export function Err({ error }: { error: ActError | null }) {
  if (!error) return null;
  return <p className="st-err" role="alert">{error.message}</p>;
}

/** Shows a private link once. The server keeps only a hash, so it cannot be shown again. */
export function ShareLink({ url, message, onDone, note }: { url: string; message: string; onDone?: () => void; note?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  return (
    <div className="st-link" role="status">
      <code>{url}</code>
      <div className="st-row">
        <button className="btn btn-sm" type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
        <a className="btn btn-sm btn-gold" href={whatsappLink(message)} target="_blank" rel="noreferrer">Send on WhatsApp</a>
        {onDone && <button className="btn btn-sm btn-quiet" type="button" onClick={onDone}>Done</button>}
      </div>
      {failed && <p className="st-err">Could not copy. Select the link above and copy it by hand.</p>}
      <p className="fine">{note ?? "This link is shown once and can't be shown again. Copy or send it now."}</p>
    </div>
  );
}

const CLASS: Record<string, string> = {
  draft: "s-draft", in_review: "s-draft", approved: "s-done", revision_requested: "s-blocked",
  queued: "s-draft", ready: "s-done", failed: "s-blocked", blocked: "s-blocked",
  granted: "s-done", requested: "s-draft", declined: "s-blocked", revoked: "s-blocked", "not asked": "s-off",
  new: "s-draft", replied: "s-done", closed: "s-off",
};
const LABEL: Record<string, string> = {
  draft: "Draft", in_review: "In review", approved: "Approved", revision_requested: "Changes asked",
  queued: "Queued", ready: "Ready", failed: "Failed", blocked: "Held",
  granted: "Granted", requested: "Asked", declined: "Declined", revoked: "Revoked", "not asked": "Not asked",
  new: "New", replied: "Replied", closed: "Closed",
};
export function Pill({ status }: { status: string }) {
  return <span className={`pill ${CLASS[status] ?? "s-off"}`}>{LABEL[status] ?? status}</span>;
}

export const dateOf = (t: number | null | undefined) => (t ? new Date(t).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "");
