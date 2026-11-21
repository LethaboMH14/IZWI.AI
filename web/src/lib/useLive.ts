"use client";
// Keeps a server resource fresh. Polls fast while work is running, slowly otherwise, and pauses when the tab is hidden.
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

export function useLive<T>(url: string | null, opts: { initial?: T; busy?: (d: T) => boolean; fastMs?: number; slowMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(opts.initial);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!opts.initial);
  const { busy, fastMs = 1500, slowMs = 10_000 } = opts;
  // Derived during render from state; the effect below restarts only when this flips.
  const isBusy = data !== undefined && !!busy?.(data);
  const hasInitial = opts.initial !== undefined;

  const refresh = useCallback(async () => {
    if (!url) return;
    try {
      const d = await api<T>(url);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, (e as Error).message));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const delay = isBusy ? fastMs : slowMs;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") await refresh();
      if (!stopped) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, hasInitial ? Math.min(delay, 1500) : 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, refresh, isBusy, fastMs, slowMs, hasInitial]);

  return { data, error, loading, refresh, setData };
}
