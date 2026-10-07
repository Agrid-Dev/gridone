import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const getStructure = vi.fn();
const updateStructure = vi.fn();
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ dashboards: { getStructure, updateStructure } }),
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a) },
}));

import {
  useDashboardStructureEntries,
  useUpdateStructure,
} from "./useDashboards";

const STORE_KEY = "gridone.dashboards.structure";
const STORED = { items: [{ kind: "dashboard", id: "d1", name: "ECS Ouest" }] };
const FETCHED = {
  items: [
    { kind: "dashboard", id: "d1", name: "ECS Ouest" },
    { kind: "dashboard", id: "d2", name: "CTA" },
  ],
};
const STORED_BACK = { items: [FETCHED.items[1], FETCHED.items[0]] };

function wrapperFor(client: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

function renderEntries(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  }),
) {
  return renderHook(() => useDashboardStructureEntries(), {
    wrapper: wrapperFor(client),
  });
}

beforeEach(() => {
  localStorage.clear();
  getStructure.mockReset().mockResolvedValue(FETCHED);
  updateStructure.mockReset().mockResolvedValue(STORED_BACK);
  toastError.mockReset();
});
afterEach(cleanup);

describe("useDashboardStructureEntries", () => {
  it("opens on the structure stored last time, then follows the server and stores it", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify(STORED));
    const { result } = renderEntries();
    expect(result.current).toEqual({ structure: STORED, ready: true });

    await waitFor(() => expect(result.current.structure).toEqual(FETCHED));
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual(FETCHED);
  });

  it("has nothing to draw on a first visit, or over a store it cannot trust", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ items: [{ id: 1 }] }));
    const { result } = renderEntries();
    expect(result.current).toEqual({ structure: { items: [] }, ready: false });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.structure).toEqual(FETCHED);
  });
});

describe("useUpdateStructure", () => {
  function renderUpdate() {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    const entries = renderEntries(client);
    const update = renderHook(() => useUpdateStructure(), {
      wrapper: wrapperFor(client),
    });
    return { entries, update };
  }

  it("shows the structure as the server stored it, in the cache and in the store", async () => {
    const { entries, update } = renderUpdate();
    await waitFor(() =>
      expect(entries.result.current.structure).toEqual(FETCHED),
    );
    const sent = {
      items: [
        { kind: "dashboard" as const, id: "d2" },
        { kind: "dashboard" as const, id: "d1" },
      ],
    };

    await act(async () => {
      await update.result.current.updateStructure(sent);
    });

    expect(updateStructure).toHaveBeenCalledWith(sent);
    await waitFor(() =>
      expect(entries.result.current.structure).toEqual(STORED_BACK),
    );
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual(STORED_BACK);
    expect(getStructure).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous structure, and says so, when the server refuses", async () => {
    const { entries, update } = renderUpdate();
    await waitFor(() =>
      expect(entries.result.current.structure).toEqual(FETCHED),
    );
    updateStructure.mockRejectedValue(new Error("boom"));

    await expect(
      act(() => update.result.current.updateStructure({ items: [] })),
    ).rejects.toThrow("boom");

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(entries.result.current.structure).toEqual(FETCHED);
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!)).toEqual(FETCHED);
  });
});
