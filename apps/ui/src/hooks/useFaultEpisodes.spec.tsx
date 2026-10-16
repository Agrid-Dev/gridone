import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import type {
  FaultEpisode,
  FaultEpisodeListParams,
  FaultEpisodes,
} from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { useFaultEpisodes } from "./useFaultEpisodes";
import { useRecurrenceNotes } from "@/pages/faults/useRecurrenceNotes";

const list = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ devices: { listFaultEpisodes: list } }),
}));
vi.mock("@/contexts/AuthContext", () => ({ usePermissions: () => () => true }));
vi.mock("react-i18next", () =>
  createI18nMock({
    "faults.recurrence": "{{count}} times {{span}}",
    "faults.span.7d": "over seven days",
  }),
);
const NOW = Date.parse("2026-10-14T12:00:00Z");
const EPISODE: FaultEpisode = {
  device_id: "a",
  device_name: "A",
  attribute_name: "alarm",
  data_type: "bool",
  severity: "alert",
  value: true,
  started_at: "2026-10-14T10:00:00Z",
  ended_at: null,
};
function response(
  episodes: FaultEpisode[] = [],
  truncated = false,
): FaultEpisodes {
  const now = Date.now();
  return {
    episodes,
    truncated,
    start: new Date(now - 86_400_000).toISOString(),
    end: new Date(now).toISOString(),
    as_of: new Date(now).toISOString(),
  };
}
let cache: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
async function tick(ms = 1) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  focusManager.setFocused(true);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  list.mockReset();
  list.mockImplementation(async () => response());
});
afterEach(() => {
  cleanup();
  cache.clear();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

describe("mounted history queries", () => {
  it("refreshes relative history and advances both period bounds", async () => {
    const { result } = renderHook(() => useFaultEpisodes({ last: "1d" }), {
      wrapper,
    });
    await tick();
    const start = result.current.period!.start;
    list.mockImplementation(async () => response([EPISODE]));
    await tick(60_000);
    expect(list).toHaveBeenCalledTimes(2);
    expect(result.current.episodes).toEqual([EPISODE]);
    expect(result.current.period!.start - start).toBe(60_000);
    expect(result.current.period!.end).toBe(result.current.asOf);
  });
  it.each(["ongoing", "incomplete"])(
    "refreshes a fixed period while %s, then stops when settled",
    async (state) => {
      list.mockResolvedValueOnce(
        response(state === "ongoing" ? [EPISODE] : [], state === "incomplete"),
      );
      renderHook(
        () =>
          useFaultEpisodes({
            start: "2026-10-13T00:00:00Z",
            end: "2026-10-13T12:00:00Z",
          }),
        { wrapper },
      );
      await tick();
      await tick(60_000);
      expect(list).toHaveBeenCalledTimes(2);
      await tick(120_000);
      expect(list).toHaveBeenCalledTimes(2);
    },
  );
  it("stops polling in a hidden tab and refreshes on return", async () => {
    renderHook(() => useFaultEpisodes({ last: "7d" }), { wrapper });
    await tick();
    act(() => focusManager.setFocused(false));
    await tick(120_000);
    expect(list).toHaveBeenCalledTimes(1);
    act(() => focusManager.setFocused(true));
    await tick();
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("refreshes recurrence through the real history query and hides incomplete counts", async () => {
    list.mockResolvedValueOnce(response([EPISODE]));
    const { result } = renderHook(() => useRecurrenceNotes(), { wrapper });
    await tick();
    expect(result.current.size).toBe(0);
    const older = {
      ...EPISODE,
      started_at: "2026-10-13T10:00:00Z",
      ended_at: "2026-10-13T11:00:00Z",
    };
    list.mockResolvedValue(response([EPISODE, older]));
    await tick(60_000);
    expect(result.current.get("a:alarm")).toBe("2 times over seven days");
    list.mockResolvedValue(response([EPISODE, older], true));
    await tick(60_000);
    expect(result.current.size).toBe(0);
  });
  it("uses the new period when the mounted query changes", async () => {
    const { rerender } = renderHook(
      ({ params }: { params: FaultEpisodeListParams }) =>
        useFaultEpisodes(params),
      { wrapper, initialProps: { params: { last: "7d" } } },
    );
    await tick();
    rerender({ params: { last: "1d" } });
    await tick();
    expect(list).toHaveBeenLastCalledWith({ last: "1d" });
  });
});
