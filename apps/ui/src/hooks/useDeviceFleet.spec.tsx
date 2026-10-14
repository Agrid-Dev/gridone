import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ devices: { list } }),
}));
vi.mock("react-i18next", () =>
  createI18nMock({ "devices.unableToLoad": "Devices could not be loaded" }),
);

// Imported after the mocks are registered.
import { useDeviceFleet } from "./useDeviceFleet";
import {
  FLEET_ATTRIBUTES,
  FLEET_KEY,
} from "@/pages/devices/standard-devices/fleetAttributes";

const DEVICE = { id: "dev1", name: "Ch. 201" } as unknown as Device;

function setup<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(hook, { wrapper }) };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  list.mockReset();
});

describe("useDeviceFleet", () => {
  it("asks for the card attributes and the faults, beside the filter", async () => {
    list.mockResolvedValue([]);
    setup(() =>
      useDeviceFleet({
        types: ["thermostat"],
        tags: { floor: ["2"] },
        is_faulty: true,
      }),
    );

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(list).toHaveBeenCalledWith({
      type: ["thermostat"],
      tags: ["floor:2"],
      is_faulty: true,
      include_attributes: [...FLEET_ATTRIBUTES],
      include_attribute_kinds: ["fault"],
    });
    const [{ include_attributes }] = list.mock.calls[0];
    expect(include_attributes).toEqual(
      expect.arrayContaining([
        "connection_status",
        "temperature",
        "temperature_setpoint",
        "onoff_state",
        "mode",
      ]),
    );
  });

  it("asks for the selection alone without a filter", async () => {
    list.mockResolvedValue([]);
    setup(() => useDeviceFleet());

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(list).toHaveBeenCalledWith({
      include_attributes: [...FLEET_ATTRIBUTES],
      include_attribute_kinds: ["fault"],
    });
  });

  it("caches under the fleet key, apart from the full device lists", async () => {
    list.mockResolvedValue([]);
    const filter = { types: ["thermostat"] };
    const { client } = setup(() => useDeviceFleet(filter));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: ["devices"] })
        .map((query) => query.queryKey),
    ).toEqual([["devices", FLEET_KEY, filter]]);
  });

  it("refreshes whenever the device lists are invalidated", async () => {
    list.mockResolvedValue([]);
    const { client } = setup(() => useDeviceFleet());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    await act(() => client.invalidateQueries({ queryKey: ["devices"] }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("returns the listed devices once loaded", async () => {
    list.mockResolvedValue([DEVICE]);
    const { result } = setup(() => useDeviceFleet());

    expect(result.current).toEqual({ devices: [], loading: true, error: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      devices: [DEVICE],
      loading: false,
      error: null,
    });
  });

  it.each([
    ["an error's message", new Error("Gateway timeout"), "Gateway timeout"],
    [
      "the generic message for anything else",
      "nope",
      "Devices could not be loaded",
    ],
  ])("reports %s", async (_case, rejection, message) => {
    list.mockRejectedValue(rejection);
    const { result } = setup(() => useDeviceFleet());

    await waitFor(() => expect(result.current.error).toBe(message));
    expect(result.current.devices).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it.each([
    ["every 10 s by default", undefined, 10_000],
    ["on the interval it is given", { refetchInterval: 60_000 }, 60_000],
  ])("refreshes %s", async (_case, options, interval) => {
    vi.useFakeTimers();
    list.mockResolvedValue([]);
    setup(() => useDeviceFleet(undefined, options));
    await vi.advanceTimersByTimeAsync(0);
    expect(list).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(interval - 1);
    expect(list).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(list).toHaveBeenCalledTimes(2);
  });
});
