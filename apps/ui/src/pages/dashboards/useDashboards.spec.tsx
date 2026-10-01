import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const list = vi.fn();
const reorder = vi.fn();
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ dashboards: { list, reorder } }),
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a) },
}));

import { useDashboardEntries, useReorderDashboards } from "./useDashboards";

const STORE_KEY = "gridone.dashboards";
const STORED = [{ id: "d1", name: "ECS Ouest" }];
const FETCHED = [
  { id: "d1", name: "ECS Ouest" },
  { id: "d2", name: "CTA" },
];

function wrapperFor(client: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

function renderEntries() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useDashboardEntries(), {
    wrapper: wrapperFor(client),
  });
}

beforeEach(() => {
  localStorage.clear();
  list.mockReset().mockResolvedValue(FETCHED);
  reorder.mockReset().mockResolvedValue(undefined);
  toastError.mockReset();
});
afterEach(cleanup);

describe("useDashboardEntries", () => {
  it("opens on the entries stored last time, then follows the list and stores it", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify(STORED));
    const { result } = renderEntries();
    expect(result.current).toEqual({ dashboards: STORED, ready: true });

    await waitFor(() => expect(result.current.dashboards).toEqual(FETCHED));
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual(FETCHED);
  });

  it("has nothing to draw on a first visit, or over a store it cannot trust", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify([{ id: 1 }]));
    const { result } = renderEntries();
    expect(result.current).toEqual({ dashboards: [], ready: false });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.dashboards).toEqual(FETCHED);
  });
});

describe("useReorderDashboards", () => {
  function renderReorder() {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    const entries = renderHook(() => useDashboardEntries(), {
      wrapper: wrapperFor(client),
    });
    const reorderHook = renderHook(() => useReorderDashboards(), {
      wrapper: wrapperFor(client),
    });
    return { entries, reorderHook };
  }

  it("shows the new order at once, in the list and in the store, before the server answers", async () => {
    const { entries, reorderHook } = renderReorder();
    await waitFor(() =>
      expect(entries.result.current.dashboards).toEqual(FETCHED),
    );
    let settle!: () => void;
    reorder.mockReturnValue(new Promise<void>((resolve) => (settle = resolve)));

    await act(async () =>
      reorderHook.result.current.reorderDashboards(["d2", "d1"]),
    );

    expect(reorder).toHaveBeenCalledWith({ ordered_ids: ["d2", "d1"] });
    // The server has not answered yet: what shows is the optimistic order.
    await waitFor(() =>
      expect(entries.result.current.dashboards.map((d) => d.id)).toEqual([
        "d2",
        "d1",
      ]),
    );
    expect(
      JSON.parse(localStorage.getItem(STORE_KEY)!).map(
        (d: { id: string }) => d.id,
      ),
    ).toEqual(["d2", "d1"]);
    await act(async () => settle());
  });

  it("falls back to the previous order, and says so, when the server refuses", async () => {
    const { entries, reorderHook } = renderReorder();
    await waitFor(() =>
      expect(entries.result.current.dashboards).toEqual(FETCHED),
    );
    reorder.mockRejectedValue(new Error("boom"));

    await act(async () =>
      reorderHook.result.current.reorderDashboards(["d2", "d1"]),
    );

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(entries.result.current.dashboards).toEqual(FETCHED);
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual(FETCHED);
  });
});
