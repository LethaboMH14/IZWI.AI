import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectState } from "@/server/state";
import { ApiError } from "../src/lib/api";
import { createProjectStore } from "../src/lib/project-store";

function fixture(overrides: Record<string, unknown> = {}): ProjectState {
  return { clips: [], jobs: [], outputs: [], people: [], tracks: [], ...overrides } as unknown as ProjectState;
}
function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("project store", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("drops a late refresh response", async () => {
    const resolvers: Array<(value: Response) => void> = [];
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const store = createProjectStore("p", fixture());
    const older = store.getState().refresh();
    const newer = store.getState().refresh();
    resolvers[1](response(fixture({ marker: "new" })));
    await newer;
    resolvers[0](response(fixture({ marker: "old" })));
    await older;
    expect((store.getState().state as unknown as { marker: string }).marker).toBe("new");
  });

  it("serializes same-key writes, allows other keys, counts pending, and does not retry failures", async () => {
    const store = createProjectStore("p", fixture());
    vi.mocked(fetch).mockResolvedValue(response(fixture()));
    let resolveFirst: (() => void) | undefined;
    const order: string[] = [];
    const first = store.getState().mutate("clip", async () => {
      order.push("first-start");
      await new Promise<void>((resolve) => { resolveFirst = resolve; });
      order.push("first-end");
      return 1;
    });
    const second = store.getState().mutate("clip", async () => { order.push("second"); return 2; });
    let resolveOther: (() => void) | undefined;
    const other = store.getState().mutate("other", async () => {
      order.push("other");
      await new Promise<void>((resolve) => { resolveOther = resolve; });
      return 3;
    });
    await vi.waitFor(() => expect(order).toContain("other"));
    expect(order).toEqual(["first-start", "other"]);
    expect(store.getState().save.pending).toBe(3);
    resolveFirst?.();
    resolveOther?.();
    await Promise.all([first, second, other]);
    expect(order).toEqual(["first-start", "other", "first-end", "second"]);
    expect(store.getState().save.pending).toBe(0);
    vi.mocked(fetch).mockClear();
    await expect(store.getState().mutate("bad", async () => { throw new Error("conflict"); })).rejects.toThrow("conflict");
    expect(store.getState().save.lastError).toBe("conflict");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("selects by replace, toggle and ordered range", () => {
    const store = createProjectStore("p", fixture({ clips: [
      { id: "b", startMs: 20 }, { id: "a", startMs: 10 }, { id: "c", startMs: 30 },
    ] }));
    store.getState().select(["b"]);
    store.getState().select(["a"], "toggle");
    expect(store.getState().selection).toEqual(["b", "a"]);
    store.getState().select(["c"], "range");
    expect(store.getState().selection).toEqual(["a", "b", "c"]);
    store.getState().select(["a"]);
    expect(store.getState().selection).toEqual(["a"]);
    store.getState().clearSelection();
    expect(store.getState().selection).toEqual([]);
  });

  it("schedules fast and slow polling intervals from projectBusy", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.mocked(fetch).mockResolvedValue(response(fixture({ jobs: [{ status: "running" }] })));
    const busy = createProjectStore("busy", fixture({ jobs: [{ status: "running" }] }));
    busy.getState().startPolling();
    await vi.advanceTimersByTimeAsync(1499);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    busy.getState().stopPolling();
    vi.mocked(fetch).mockClear().mockResolvedValue(response(fixture()));
    const idle = createProjectStore("idle", fixture());
    idle.getState().startPolling();
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    idle.getState().stopPolling();
  });

  it("caches track lines by updated_at and fetches again after version changes", async () => {
    const store = createProjectStore("p", fixture({ tracks: [{ id: "t", updated_at: 1 }] }));
    vi.mocked(fetch).mockResolvedValue(response({ lines: [{ text: "one" }] }));
    await store.getState().loadTrack("t");
    await store.getState().loadTrack("t");
    expect(fetch).toHaveBeenCalledTimes(1);
    store.setState((state) => ({ state: { ...state.state, tracks: [{ id: "t", updated_at: 2 }] } as ProjectState }));
    await store.getState().loadTrack("t");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sets the later BroadcastChannel instance read-only", () => {
    class ChannelMock {
      static channels: ChannelMock[] = [];
      listener: ((event: MessageEvent<unknown>) => void) | undefined;
      constructor(_name: string) { ChannelMock.channels.push(this); }
      addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) { this.listener = listener; }
      postMessage(message: unknown) {
        for (const channel of ChannelMock.channels) if (channel !== this) channel.listener?.({ data: message } as MessageEvent<unknown>);
      }
    }
    vi.stubGlobal("BroadcastChannel", ChannelMock);
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const older = createProjectStore("p", fixture());
    vi.setSystemTime(2000);
    const newer = createProjectStore("p", fixture());
    vi.stubGlobal("document", { visibilityState: "hidden", addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    older.getState().startPolling();
    newer.getState().startPolling();
    expect(newer.getState().readOnly).toEqual({ value: true, reason: "Open in another tab" });
    older.getState().stopPolling();
    vi.advanceTimersByTime(300);
    expect(newer.getState().readOnly.value).toBe(false);
  });

  it("keeps API errors typed", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ error: "unauthorized" }, 401));
    const store = createProjectStore("p", fixture());
    await store.getState().refresh();
    expect(store.getState().error).toBeInstanceOf(ApiError);
    expect(store.getState().error?.status).toBe(401);
  });
});
