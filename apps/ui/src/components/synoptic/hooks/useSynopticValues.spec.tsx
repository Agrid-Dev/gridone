import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AttributeSlot, Device, Synoptic } from "@gridone/sdk";

const { mockGet, mockList, socket } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockList: vi.fn(),
  socket: { isConnected: true },
}));

vi.mock("@/contexts/DeviceContext", () => ({
  useDeviceContext: () => socket,
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      get: (...args: unknown[]) => mockGet(...args),
      list: (...args: unknown[]) => mockList(...args),
    },
  }),
}));

// Imports below this line must come after the vi.mock calls.
import { DEVICE_POLL_INTERVAL_MS } from "@/hooks/useDevice";
import { useSynopticValues } from "./useSynopticValues";

const NOW = new Date("2026-09-14T12:00:00Z");
const ago = (seconds: number) =>
  new Date(NOW.getTime() - seconds * 1000).toISOString();

const attr = (current_value: unknown, last_updated: string | null) => ({
  kind: "standard",
  name: "x",
  data_type: "float",
  read_write_modes: ["read"],
  current_value,
  last_updated,
  last_changed: last_updated,
});

const PAC: Device = {
  id: "PAC-03",
  name: "PAC 03",
  config: {},
  driver_id: "awhp",
  transport_id: "modbus",
  is_faulty: true,
  attributes: {
    onoff_state: attr(true, ago(10)),
    outlet_temperature: attr(52.37, ago(120)),
    power: attr(12, null),
  },
};

const slot = (
  devices: AttributeSlot["target"]["devices"],
  attribute: string,
  extra: Partial<AttributeSlot> = {},
): AttributeSlot => ({
  kind: "attribute",
  target: { devices, attribute },
  ...extra,
});

const BY_ID = { ids: ["PAC-03"] };

const DOC: Synoptic = {
  id: "p",
  name: "plate",
  metadata: {},
  defaults: { stale_after: 5 },
  symbols: [
    {
      id: "pac",
      type: "heat_pump",
      placement: { kind: "cell", cell: { x: 0, y: 0 } },
      device_id: "PAC-03",
      bindings: {
        state: slot(BY_ID, "onoff_state", { labels: { true: "MARCHE" } }),
        supply_temp: slot(BY_ID, "outlet_temperature", {
          unit: "°C",
          decimals: 1,
          stale_after: 600,
        }),
        power: slot(BY_ID, "power"),
        fault: slot(BY_ID, "general_fault"),
      },
    },
    {
      id: "b01",
      type: "tank",
      placement: { kind: "cell", cell: { x: 4, y: 0 } },
      device_id: "B-01",
    },
  ],
  pipes: [
    {
      id: "supply",
      fluid: "primary_supply",
      from: { kind: "cell", cell: { x: 0, y: 0 } },
      to: { kind: "cell", cell: { x: 1, y: 0 } },
      flow: slot({ types: ["awhp"] }, "onoff_state"),
      tags: [],
    },
  ],
  labels: [
    {
      id: "rooms",
      at: { x: 0, y: 0 },
      text: "rooms",
      role: "note",
      value: { kind: "text", text: "104" },
    },
  ],
};

function setup(doc = DOC) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useSynopticValues(doc), { wrapper });
  return { queryClient, rendered };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  socket.isConnected = true;
  mockGet.mockImplementation((id: string) =>
    Promise.resolve(id === "PAC-03" ? PAC : { id, attributes: {} }),
  );
  mockList.mockResolvedValue([PAC]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useSynopticValues", () => {
  it("is all silent before any device has arrived", () => {
    const { rendered } = setup();
    expect(rendered.result.current.slots["symbol.pac.state"]).toEqual({
      text: null,
      raw: null,
      stale: false,
      faulty: false,
    });
    expect(rendered.result.current.faultyDevices).toEqual({});
  });

  it("reads, formats and ages each slot once its device is in", async () => {
    const { rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.state"].text).toBe(
        "MARCHE",
      ),
    );
    const { slots, faultyDevices } = rendered.result.current;
    // 10 s old against the document default of 5 s.
    expect(slots["symbol.pac.state"]).toEqual({
      text: "MARCHE",
      raw: true,
      stale: true,
      faulty: true,
    });
    // 120 s old against the binding's own 600 s.
    expect(slots["symbol.pac.supply_temp"]).toEqual({
      text: "52.4 °C",
      raw: 52.37,
      stale: false,
      faulty: true,
    });
    // A value with no timestamp, and an attribute the device lacks.
    expect(slots["symbol.pac.power"].text).toBeNull();
    expect(slots["symbol.pac.fault"].text).toBeNull();
    expect(slots["symbol.pac.fault"].faulty).toBe(true);
    expect(slots["label.rooms"]).toBeUndefined();
    expect(faultyDevices).toEqual({ "PAC-03": true, "B-01": false });
  });

  it("resolves a filter target through the device list, once", async () => {
    const { rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["pipe.supply.flow"].raw).toBe(true),
    );
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith({ type: ["awhp"] });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("follows a cache patch without refetching, as the socket handler writes it", async () => {
    const { queryClient, rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.state"].raw).toBe(true),
    );
    act(() => {
      queryClient.setQueryData<Device>(["device", "PAC-03"], {
        ...PAC,
        is_faulty: false,
        attributes: {
          ...PAC.attributes,
          onoff_state: attr(false, ago(0)),
        },
      });
    });
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.state"]).toEqual({
        text: "false",
        raw: false,
        stale: false,
        faulty: false,
      }),
    );
    expect(rendered.result.current.faultyDevices["PAC-03"]).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("polls the devices only while the socket is down", async () => {
    const { rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.state"].raw).toBe(true),
    );
    expect(mockGet).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(2 * DEVICE_POLL_INTERVAL_MS);
    });
    expect(mockGet).toHaveBeenCalledTimes(2);

    socket.isConnected = false;
    const offline = setup();
    await waitFor(() =>
      expect(
        offline.rendered.result.current.slots["symbol.pac.state"].raw,
      ).toBe(true),
    );
    const before = mockGet.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(DEVICE_POLL_INTERVAL_MS + 100);
    });
    await waitFor(() =>
      expect(mockGet.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("never goes stale when neither the binding nor the document sets a threshold", async () => {
    const { rendered } = setup({ ...DOC, defaults: {} });
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.state"].raw).toBe(true),
    );
    expect(rendered.result.current.slots["symbol.pac.state"].stale).toBe(false);
  });

  it("goes stale as the clock advances", async () => {
    const { rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.supply_temp"].raw).toBe(
        52.37,
      ),
    );
    expect(rendered.result.current.slots["symbol.pac.supply_temp"].stale).toBe(
      false,
    );
    act(() => {
      vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
      vi.advanceTimersByTime(60_000);
    });
    expect(rendered.result.current.slots["symbol.pac.supply_temp"].stale).toBe(
      true,
    );
  });
});
