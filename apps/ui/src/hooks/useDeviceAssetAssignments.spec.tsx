import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { mockAssignAssets } = vi.hoisted(() => ({
  mockAssignAssets: vi.fn(),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      assignAssets: (...args: unknown[]) => mockAssignAssets(...args),
    },
  }),
}));

// Imports below this line must come after the vi.mock calls.
import { useDeviceAssetAssignments } from "./useDeviceAssetAssignments";

const ASSIGNMENTS = [
  { device_id: "dev1", asset_id: "lobby" },
  { device_id: "dev2", asset_id: "lobby" },
  { device_id: "dev3", asset_id: "lobby" },
];

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    invalidate,
    rendered: renderHook(() => useDeviceAssetAssignments(), { wrapper }),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDeviceAssetAssignments", () => {
  it("splits the per-device results by status", async () => {
    mockAssignAssets.mockResolvedValue({
      results: [
        { device_id: "dev1", asset_id: "lobby", status: "applied" },
        { device_id: "dev2", asset_id: "lobby", status: "unchanged" },
        {
          device_id: "dev3",
          asset_id: "lobby",
          status: "failed",
          error: "Device not found",
        },
      ],
    });
    const { rendered } = setup();

    act(() => rendered.result.current.mutate(ASSIGNMENTS));

    await waitFor(() => expect(rendered.result.current.isSuccess).toBe(true));
    expect(mockAssignAssets).toHaveBeenCalledExactlyOnceWith(ASSIGNMENTS);
    const outcome = rendered.result.current.data!;
    expect(outcome.applied.map((r) => r.device_id)).toEqual(["dev1"]);
    expect(outcome.unchanged.map((r) => r.device_id)).toEqual(["dev2"]);
    expect(outcome.failed.map((r) => r.device_id)).toEqual(["dev3"]);
  });

  it("refreshes both sides of the link once, plus the devices that moved", async () => {
    mockAssignAssets.mockResolvedValue({
      results: [
        { device_id: "dev1", asset_id: "lobby", status: "applied" },
        { device_id: "dev2", asset_id: "lobby", status: "unchanged" },
      ],
    });
    const { invalidate, rendered } = setup();

    act(() => rendered.result.current.mutate(ASSIGNMENTS));

    await waitFor(() => expect(rendered.result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["assets"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["devices"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["device", "dev1"] });
    // The unchanged device holds the same data it did before the call.
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: ["device", "dev2"],
    });
  });

  it("refreshes nothing when the batch changed nothing", async () => {
    mockAssignAssets.mockResolvedValue({
      results: [{ device_id: "dev1", asset_id: "lobby", status: "unchanged" }],
    });
    const { invalidate, rendered } = setup();

    act(() => rendered.result.current.mutate(ASSIGNMENTS));

    await waitFor(() => expect(rendered.result.current.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
