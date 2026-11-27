import { createStore, type StoreApi } from "zustand/vanilla";
import type { ProjectState } from "@/server/state";
import { api, ApiError } from "./api";
import { projectBusy } from "./stage-counts";

export type TrackCache = { updatedAt: number; lines: unknown[]; status: "loading" | "ready" | "error"; error?: string };
export type ProjectStoreState = {
  id: string;
  state: ProjectState;
  error: ApiError | null;
  loading: boolean;
  selection: string[];
  anchor: string | null;
  save: { pending: number; lastSavedAt: number | null; lastError: string | null };
  readOnly: { value: boolean; reason: string | null };
  tracks: Record<string, TrackCache>;
  refresh(): Promise<void>;
  select(ids: string[], mode?: "replace" | "toggle" | "range"): void;
  clearSelection(): void;
  mutate<T>(entityKey: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T>;
  loadTrack(trackId: string): Promise<void>;
  invalidateTrack(trackId: string): void;
  startPolling(): void;
  stopPolling(): void;
};

// singleEditor: the old second-tab read-only guard. Off by default since the server's conditional writes
// (ui-contracts C: expectUpdatedAt / expectText → 409) protect concurrent edits; kept for tests and as a fallback.
export function createProjectStore(id: string, initial: ProjectState, opts: { singleEditor?: boolean } = {}): StoreApi<ProjectStoreState> {
  let requestGeneration = 0;
  let newestApplied = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controllers = new Set<AbortController>();
  let stopped = true;
  const queues = new Map<string, Promise<unknown>>();
  const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const startedAt = Date.now();
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`izwi-project-${id}`);
  let blockingTab: string | null = null;
  let guardActive = false;
  let takeoverTimer: ReturnType<typeof setTimeout> | undefined;
  const store = createStore<ProjectStoreState>()((set, get) => ({
    id, state: initial, error: null, loading: false, selection: [], anchor: null,
    save: { pending: 0, lastSavedAt: null, lastError: null },
    readOnly: { value: false, reason: null }, tracks: {},
    // `refresh` is declared below; wrap it so it is read when called, never during store creation.
    refresh: () => refresh(),
    select(ids, mode = "replace") {
      const current = get().selection;
      let selection: string[];
      if (mode === "toggle") {
        const next = new Set(current);
        for (const value of ids) { if (next.has(value)) next.delete(value); else next.add(value); }
        selection = [...next];
      } else if (mode === "range" && ids[0]) {
        const target = ids[0];
        const ordered = [...get().state.clips].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
        const start = ordered.findIndex((clip) => clip.id === (get().anchor ?? current.at(-1)));
        const end = ordered.findIndex((clip) => clip.id === target);
        selection = start < 0 || end < 0 ? [target] : ordered.slice(Math.min(start, end), Math.max(start, end) + 1).map((clip) => clip.id);
      } else selection = [...new Set(ids)];
      set({ selection, anchor: mode === "range" ? (get().anchor ?? ids[0] ?? null) : (ids[0] ?? get().anchor) });
    },
    clearSelection() { set({ selection: [], anchor: null }); },
    async mutate<T>(entityKey: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
      const previous = queues.get(entityKey) ?? Promise.resolve();
      set((s) => ({ save: { ...s.save, pending: s.save.pending + 1, lastError: null } }));
      const task = previous.catch(() => undefined).then(async () => {
        const mutationController = new AbortController();
        try {
          const result = await fn(mutationController.signal);
          set((s) => ({ save: { ...s.save, lastSavedAt: Date.now() } }));
          await refresh();
          return result;
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Save failed.";
          set((s) => ({ save: { ...s.save, lastError: message } }));
          // 409: someone else changed it first. Load their version instead of leaving a stale view on screen.
          if (cause instanceof ApiError && cause.status === 409) void refresh();
          throw cause;
        } finally { set((s) => ({ save: { ...s.save, pending: Math.max(0, s.save.pending - 1) } })); }
      });
      queues.set(entityKey, task);
      void task.finally(() => { if (queues.get(entityKey) === task) queues.delete(entityKey); }).catch(() => undefined);
      return task as Promise<T>;
    },
    async loadTrack(trackId) {
      const metadata = get().state.tracks.find((track) => track.id === trackId);
      if (!metadata) return;
      const updatedAt = metadata.updated_at;
      if (get().tracks[trackId]?.status === "ready" && get().tracks[trackId]?.updatedAt === updatedAt) return;
      set((s) => ({ tracks: { ...s.tracks, [trackId]: { updatedAt, lines: s.tracks[trackId]?.lines ?? [], status: "loading" } } }));
      try {
        const result = await api<{ lines: unknown[] }>(`/api/items/track/${encodeURIComponent(trackId)}`);
        if (get().state.tracks.find((track) => track.id === trackId)?.updated_at !== updatedAt) return;
        set((s) => ({ tracks: { ...s.tracks, [trackId]: { updatedAt, lines: result.lines, status: "ready" } } }));
      } catch (cause) { set((s) => ({ tracks: { ...s.tracks, [trackId]: { updatedAt, lines: [], status: "error", error: cause instanceof Error ? cause.message : "Track unavailable." } } })); }
    },
    invalidateTrack(trackId) { set((s) => { const tracks = { ...s.tracks }; delete tracks[trackId]; return { tracks }; }); },
    startPolling() {
      if (!stopped) return;
      stopped = false;
      if (channel && opts.singleEditor) { guardActive = true; channel.postMessage({ type: "hello", tabId, startedAt }); window.addEventListener("beforeunload", onBeforeUnload); }
      document.addEventListener("visibilitychange", onVisibility);
      const schedule = () => {
        if (stopped) return;
        const delay = projectBusy(get().state) ? 1500 : 10_000;
        timer = setTimeout(async () => { if (document.visibilityState === "visible") await refresh(); schedule(); }, delay);
      };
      schedule();
    },
    stopPolling() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const request of controllers) request.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      guardActive = false;
      channel?.postMessage({ type: "bye", tabId, startedAt });
    },
  }));

  const refresh = async () => {
    const generation = ++requestGeneration;
    const requestController = new AbortController();
    controllers.add(requestController);
    store.setState({ loading: true });
    try {
      // Once peaks are loaded, poll the lite read (ui-contracts F) and keep the peaks we already have.
      const prev = store.getState().state;
      const lite = (prev.peaks?.length ?? 0) > 0;
      const fetched = await api<ProjectState>(`/api/projects/${id}${lite ? "?lite=1" : ""}`, { signal: requestController.signal });
      const state = lite ? { ...fetched, peaks: fetched.peaks ?? prev.peaks } : fetched;
      if (generation < newestApplied || requestController.signal.aborted) return;
      newestApplied = generation;
      store.setState({ state, error: null });
    } catch (cause) {
      if (requestController.signal.aborted) return;
      const error = cause instanceof ApiError ? cause : new ApiError(0, cause instanceof Error ? cause.message : "Request failed.");
      store.setState({ error });
      if (error.status === 401) store.getState().stopPolling();
    } finally {
      if (generation === requestGeneration) store.setState({ loading: false });
      controllers.delete(requestController);
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible" && !stopped) void refresh();
  };
  const onBeforeUnload = () => channel?.postMessage({ type: "bye", tabId, startedAt });
  const onMessage = (event: MessageEvent<unknown>) => {
    const message = event.data as { type?: string; tabId?: string; startedAt?: number };
    if (!message.tabId || message.tabId === tabId) return;
    if (message.type === "hello" && guardActive) channel?.postMessage({ type: "here", tabId, startedAt });
    if (message.type === "here" && typeof message.startedAt === "number" && message.startedAt < startedAt) {
      blockingTab = message.tabId;
      store.setState({ readOnly: { value: true, reason: "Open in another tab" } });
    }
    if (message.type === "bye" && message.tabId === blockingTab) {
      blockingTab = null;
      if (takeoverTimer) clearTimeout(takeoverTimer);
      channel?.postMessage({ type: "hello", tabId, startedAt });
      takeoverTimer = setTimeout(() => {
        if (!blockingTab) store.setState({ readOnly: { value: false, reason: null } });
      }, 300);
    }
  };
  channel?.addEventListener("message", onMessage);

  return store;
}

// The preview <video> is the clock: it writes `ms` and `playing`. Anything else (timeline, transcript, agent)
// asks it to move with seekTo/playRange; each request carries a fresh `n` so asking twice for the same time works.
export type SeekRequest = { n: number; ms: number; endMs: number | null; play: boolean };
export type PlayheadState = {
  ms: number;
  playing: boolean;
  request: SeekRequest | null;
  set(ms: number): void;
  setPlaying(value: boolean): void;
  seekTo(ms: number): void;
  playRange(startMs: number, endMs: number): void;
  togglePlay(): void;
};
export function createPlayheadStore(): StoreApi<PlayheadState> {
  let n = 0;
  return createStore<PlayheadState>()((set, get) => ({
    ms: 0, playing: false, request: null,
    set(ms) { set({ ms }); },
    setPlaying(playing) { set({ playing }); },
    seekTo(ms) { set({ ms, request: { n: ++n, ms, endMs: null, play: get().playing } }); },
    playRange(startMs, endMs) { set({ ms: startMs, request: { n: ++n, ms: startMs, endMs, play: true } }); },
    togglePlay() { set({ request: { n: ++n, ms: get().ms, endMs: null, play: !get().playing } }); },
  }));
}
