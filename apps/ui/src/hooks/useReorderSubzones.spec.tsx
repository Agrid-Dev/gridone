import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Asset } from "@gridone/sdk";

const { mockReorderChildren, mockToastError } = vi.hoisted(() => ({
  mockReorderChildren: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    assets: {
      reorderChildren: (...args: unknown[]) => mockReorderChildren(...args),
    },
  }),
}));

vi.mock("sonner", () => ({ toast: { error: mockToastError } }));

// Imports below this line must come after the vi.mock calls.
import { useReorderSubzones } from "./useReorderSubzones";

const child = (id: string, position: number): Asset => ({
  id,
  parent_id: "floor",
  type: "room",
  name: id,
  path: ["org", "floor", id],
  position,
});

const CHILDREN_KEY = ["assets", "children", "floor"];

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData<Asset[]>(CHILDREN_KEY, [
    child("bar", 0),
    child("atrium", 1),
  ]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useReorderSubzones("floor"), { wrapper });
  return { queryClient, rendered };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useReorderSubzones", () => {
  it("persists the order and patches children positions optimistically", async () => {
    let resolveRequest!: () => void;
    mockReorderChildren.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const { queryClient, rendered } = setup();

    act(() => rendered.result.current.mutate(["atrium", "bar"]));

    // The optimistic patch lands while the request is still pending.
    await waitFor(() =>
      expect(
        queryClient
          .getQueryData<Asset[]>(CHILDREN_KEY)!
          .map((c) => [c.id, c.position]),
      ).toEqual([
        ["bar", 1],
        ["atrium", 0],
      ]),
    );
    expect(mockReorderChildren).toHaveBeenCalledWith("floor", {
      ordered_ids: ["atrium", "bar"],
    });

    act(() => resolveRequest());
    await waitFor(() => expect(rendered.result.current.isSuccess).toBe(true));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("rolls back the optimistic patch and toasts on error", async () => {
    mockReorderChildren.mockRejectedValue(new Error("boom"));
    const { queryClient, rendered } = setup();

    act(() => rendered.result.current.mutate(["atrium", "bar"]));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("boom"));
    expect(
      queryClient
        .getQueryData<Asset[]>(CHILDREN_KEY)!
        .map((c) => [c.id, c.position]),
    ).toEqual([
      ["bar", 0],
      ["atrium", 1],
    ]);
  });
});
