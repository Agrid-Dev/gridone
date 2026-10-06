import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: { list: (...args: unknown[]) => mockList(...args) },
  }),
}));

// Imports below this line must come after the vi.mock calls.
import { useTargetDevices, type AttributeTarget } from "./useTargetDevices";

const TARGETS: AttributeTarget[] = [
  { devices: { ids: ["plant"] }, attribute: "pump_1" },
  { devices: { types: ["thermostat"] }, attribute: "temperature" },
  // "Everything" is never an intentional target: resolved to nothing, unasked.
  { devices: {}, attribute: "temperature" },
];

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTargetDevices(TARGETS), { wrapper });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useTargetDevices", () => {
  it("resolves each target to its own device set, in order", async () => {
    mockList.mockImplementation(({ attribute }: { attribute: string }) =>
      Promise.resolve(
        attribute === "pump_1"
          ? [{ id: "plant" }]
          : [{ id: "t1" }, { id: "t2" }],
      ),
    );

    const { result, rerender } = setup();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.devices).toEqual([
      [{ id: "plant" }],
      [{ id: "t1" }, { id: "t2" }],
      [],
    ]);
    expect(mockList).toHaveBeenCalledTimes(2);

    // Consumers memoize the series to read against this result, so it must
    // hold its identity between renders that fetched nothing new.
    const { devices } = result.current;
    rerender();
    expect(result.current.devices).toBe(devices);
  });

  it("reports a target that failed to resolve", async () => {
    mockList.mockRejectedValue(new Error("boom"));

    const { result } = setup();

    await waitFor(() =>
      expect(result.current.error).toEqual(new Error("boom")),
    );
  });
});
