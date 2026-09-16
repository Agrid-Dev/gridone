import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Device, DeviceView } from "@gridone/sdk";

const { mockListViews } = vi.hoisted(() => ({
  mockListViews: vi.fn(),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    deviceViews: { list: (...args: unknown[]) => mockListViews(...args) },
  }),
}));

// Imports below this line must come after the vi.mock calls.
import { useDeviceGroups } from "./useDeviceGroups";

const view = (name: string, overrides: Partial<DeviceView> = {}) =>
  ({
    id: name,
    name,
    group_by: [],
    filter: { tags: { group: ["comfort"] } },
    ...overrides,
  }) as unknown as DeviceView;

const device = (tags?: Device["tags"]) =>
  ({ id: "dev1", name: "Lobby", tags }) as unknown as Device;

function setup(target: Device) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useDeviceGroups(target), { wrapper });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDeviceGroups", () => {
  it("names every membership from the view that filters on it", async () => {
    mockListViews.mockResolvedValue([
      view("Comfort"),
      view("Night", { filter: { tags: { group: ["night"] } } }),
    ]);
    const { result } = setup(device({ group: ["comfort", "night"] }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([
      { value: "comfort", name: "Comfort" },
      { value: "night", name: "Night" },
    ]);
  });

  it("ignores every view that is not a plain group filter", async () => {
    mockListViews.mockResolvedValue([
      view("Comfort"),
      view("Grouped", { group_by: ["floor"] }),
      view("Driver", {
        filter: { tags: { group: ["comfort"] }, driver_id: "d" },
      }),
      view("Ids", { filter: { tags: { group: ["comfort"] }, ids: ["dev1"] } }),
      view("Types", { filter: { tags: { group: ["comfort"] }, types: [] } }),
      view("Floor", { filter: { tags: { group: ["comfort"], floor: ["2"] } } }),
      view("Two values", { filter: { tags: { group: ["comfort", "night"] } } }),
    ]);
    const { result } = setup(device({ group: ["comfort", "night"] }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([
      { value: "comfort", name: "Comfort" },
    ]);
  });

  it("skips a membership whose view has been deleted", async () => {
    mockListViews.mockResolvedValue([view("Comfort")]);
    const { result } = setup(device({ group: ["comfort", "orphan"] }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([
      { value: "comfort", name: "Comfort" },
    ]);
  });

  it("returns nothing for an untagged device without waiting for the views", () => {
    mockListViews.mockReturnValue(new Promise(() => {}));
    const { result } = setup(device({ floor: ["2"] }));

    expect(result.current.groups).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it("reports loading while the views query is in flight", async () => {
    let deliver: (views: DeviceView[]) => void = () => {};
    mockListViews.mockReturnValue(
      new Promise((resolve) => {
        deliver = resolve;
      }),
    );
    const { result } = setup(device({ group: ["comfort"] }));

    expect(result.current.loading).toBe(true);
    expect(result.current.groups).toEqual([]);

    deliver([view("Comfort")]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([
      { value: "comfort", name: "Comfort" },
    ]);
  });
});
