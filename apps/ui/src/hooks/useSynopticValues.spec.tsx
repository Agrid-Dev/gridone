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
import { FRESHNESS_POLL_MS, useSynopticValues } from "./useSynopticValues";

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

/** PAC with some attributes replaced. */
const pacWith = (attributes: Device["attributes"]): Device => ({
  ...PAC,
  attributes: { ...PAC.attributes, ...attributes },
});

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
      // Nothing draws a run's flow: the device it names is never listed.
      flow: slot({ ids: ["FLOW-1"] }, "onoff_state"),
      tags: [
        {
          id: "flow",
          at: { x: 0, y: 0 },
          label: "FLOW",
          value: slot({ types: ["awhp"] }, "onoff_state"),
        },
      ],
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
  mockList.mockImplementation((params: { ids?: string[] }) =>
    Promise.resolve(
      params.ids
        ? params.ids.map((id) =>
            id === "PAC-03" ? PAC : { id, attributes: {} },
          )
        : [PAC],
    ),
  );
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
      unit: null,
      raw: null,
      stale: false,
      faulty: false,
      severity: null,
      lastUpdated: null,
    });
    expect(rendered.result.current.devices).toEqual({});
  });

  it("reads, formats and ages each slot once its device is in", async () => {
    const { rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.state"].text).toBe(
        "MARCHE",
      ),
    );
    const { slots, devices } = rendered.result.current;
    // 10 s old against the document default of 5 s.
    expect(slots["symbol.pac.state"]).toEqual({
      text: "MARCHE",
      unit: null,
      raw: true,
      stale: true,
      faulty: true,
      severity: null,
      lastUpdated: ago(10),
    });
    // 120 s old against the binding's own 600 s.
    expect(slots["symbol.pac.supply_temp"]).toEqual({
      text: "52.4",
      unit: "°C",
      raw: 52.37,
      stale: false,
      faulty: true,
      severity: null,
      lastUpdated: ago(120),
    });
    // A value with no timestamp, and an attribute the device lacks.
    expect(slots["symbol.pac.power"].text).toBeNull();
    expect(slots["symbol.pac.fault"].text).toBeNull();
    expect(slots["symbol.pac.fault"].faulty).toBe(true);
    expect(slots["label.rooms"]).toBeUndefined();
    expect(devices).toEqual({
      "PAC-03": { faulty: true, severity: null },
      "B-01": { faulty: false, severity: null },
    });
  });

  it("lists the plate's devices once and resolves a filter target through the list", async () => {
    const { rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["tag.flow"].raw).toBe(true),
    );
    expect(mockList).toHaveBeenCalledWith({ type: ["awhp"] });
    // The symbols' devices and the tag's resolved one; not the flow's.
    expect(mockList).toHaveBeenCalledWith({ ids: ["PAC-03", "B-01"] });
    expect(mockList).toHaveBeenCalledTimes(2);
    // Seeded from the list: no per-device request.
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("lists the plate once even when a filter resolves to a device no symbol names", async () => {
    const pump = { ...PAC, id: "PUMP-1", is_faulty: false };
    mockList.mockImplementation((params: { ids?: string[]; type?: string[] }) =>
      Promise.resolve(
        params.ids
          ? params.ids.map((id) =>
              id === "PAC-03"
                ? PAC
                : id === "PUMP-1"
                  ? pump
                  : { id, attributes: {} },
            )
          : [pump],
      ),
    );
    const { rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["tag.flow"].raw).toBe(true),
    );
    // The filter query, then one plate list that already carries PUMP-1.
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockList).toHaveBeenLastCalledWith({
      ids: ["PAC-03", "B-01", "PUMP-1"],
    });
    expect(rendered.result.current.devices["PUMP-1"].faulty).toBe(false);
  });

  it("never fetches a device the list does not return", async () => {
    mockList.mockImplementation((params: { ids?: string[] }) =>
      Promise.resolve(params.ids ? [PAC] : [PAC]),
    );
    const { rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.state"].raw).toBe(true),
    );
    expect(rendered.result.current.devices).toEqual({
      "PAC-03": { faulty: true, severity: null },
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("warns in development when a filter target is ambiguous", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockList.mockImplementation((params: { ids?: string[] }) =>
      Promise.resolve(params.ids ? [] : [PAC, { ...PAC, id: "PAC-04" }]),
    );
    const { rendered } = setup();
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("resolves to 2 devices"),
      ),
    );
    expect(rendered.result.current.slots["tag.flow"].text).toBeNull();
    warn.mockRestore();
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
      // The labels name only `true`, so a false reads silent with its raw.
      expect(rendered.result.current.slots["symbol.pac.state"]).toEqual({
        text: null,
        unit: null,
        raw: false,
        stale: false,
        faulty: false,
        severity: null,
        lastUpdated: ago(0),
      }),
    );
    expect(rendered.result.current.devices["PAC-03"].faulty).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("polls the one device list once a minute with the socket up, at the device cadence with it down, and its answer reaches the reading", async () => {
    const { rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.state"].raw).toBe(true),
    );
    const listed = mockList.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(2 * DEVICE_POLL_INTERVAL_MS);
    });
    expect(mockList).toHaveBeenCalledTimes(listed);
    act(() => {
      vi.advanceTimersByTime(FRESHNESS_POLL_MS);
    });
    await waitFor(() =>
      expect(mockList.mock.calls.length).toBeGreaterThan(listed),
    );
    expect(mockList).toHaveBeenLastCalledWith({ ids: ["PAC-03", "B-01"] });

    socket.isConnected = false;
    const offline = setup();
    await waitFor(() =>
      expect(
        offline.rendered.result.current.slots["symbol.pac.state"].raw,
      ).toBe(true),
    );
    const before = mockList.mock.calls.length;
    mockList.mockResolvedValue([pacWith({ onoff_state: attr(false, ago(0)) })]);
    act(() => {
      vi.advanceTimersByTime(DEVICE_POLL_INTERVAL_MS + 100);
    });
    await waitFor(() =>
      expect(mockList.mock.calls.length).toBeGreaterThan(before),
    );
    await waitFor(() =>
      expect(
        offline.rendered.result.current.slots["symbol.pac.state"].raw,
      ).toBe(false),
    );
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("never puts a pushed value back behind a list answer that predates it", async () => {
    // The list is requested, a push lands, then the list answers with the
    // value it saw before the push: the pushed reading is the newer one and
    // stays, only the attributes the snapshot is newer for are taken.
    const { queryClient, rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.state"].raw).toBe(true),
    );
    mockList.mockResolvedValue([pacWith({ onoff_state: attr(true, ago(5)) })]);
    act(() => {
      queryClient.setQueryData<Device>(["device", "PAC-03"], (cached) => ({
        ...cached!,
        attributes: { ...cached!.attributes, onoff_state: attr(false, ago(0)) },
      }));
    });
    const listed = mockList.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(FRESHNESS_POLL_MS + 100);
    });
    await waitFor(() =>
      expect(mockList.mock.calls.length).toBeGreaterThan(listed),
    );
    // The poll has answered when its (older) snapshot would have shown: a
    // second tick of the clock lets the effect run.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(rendered.result.current.slots["symbol.pac.state"].raw).toBe(false);
  });

  it("keeps a reading that holds fresh while the list keeps reading it", async () => {
    // A push carries a change, never a fresh last_updated for a value that
    // held, so the poll is what ages the reading: it goes stale when the
    // server stops reading it, not when the page has been open for the
    // threshold.
    mockList.mockImplementation(() =>
      Promise.resolve([
        pacWith({ outlet_temperature: attr(52.37, new Date().toISOString()) }),
      ]),
    );
    const { rendered } = setup();
    await waitFor(() =>
      expect(rendered.result.current.slots["symbol.pac.supply_temp"].raw).toBe(
        52.37,
      ),
    );
    const listed = mockList.mock.calls.length;
    // Sixteen minutes on the page, past the binding's 600 s threshold. The
    // stimulus is the threshold, not the poll: a poll longer than the
    // threshold leaves the reading stale for the rest of its period.
    act(() => {
      vi.advanceTimersByTime(16 * 60_000);
    });
    await waitFor(() =>
      expect(mockList.mock.calls.length).toBeGreaterThan(listed),
    );
    await waitFor(() =>
      expect(
        rendered.result.current.slots["symbol.pac.supply_temp"].stale,
      ).toBe(false),
    );
  });

  it("never goes stale when neither the binding nor the document sets a threshold", async () => {
    // The service always serves a document default; a document without one
    // is only reachable from a hand-built object.
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
