import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const list = vi.fn();
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ dashboards: { list } }),
}));

import { useDashboardEntries } from "./useDashboards";

const STORE_KEY = "gridone.dashboards";
const STORED = [{ id: "d1", name: "ECS Ouest" }];
const FETCHED = [
  { id: "d1", name: "ECS Ouest" },
  { id: "d2", name: "CTA" },
];

function renderEntries() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useDashboardEntries(), { wrapper });
}

beforeEach(() => {
  localStorage.clear();
  list.mockReset().mockResolvedValue(FETCHED);
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
