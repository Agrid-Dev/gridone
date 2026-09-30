import { describe, expect, it } from "vitest";
import type { SymbolElement } from "@gridone/sdk";
import { headSlot, machineFault, symbolDeviceIds, symbolHeads } from "./heads";
import type { SlotReading } from "./values";

const symbol = (extra: Partial<SymbolElement>): SymbolElement => ({
  id: "s",
  type: "pump",
  placement: { kind: "pipe", pipe: "run", cell: { x: 1, y: 0 } },
  ...extra,
});

describe("symbolHeads", () => {
  it("reads a symbol of one machine as itself: its device and every slot", () => {
    expect(symbolHeads(symbol({ device_id: "P1" }))).toEqual([
      {
        key: null,
        deviceId: "P1",
        slots: ["state", "speed"],
        state: "state",
        fault: undefined,
      },
    ]);
  });

  it("splits a twin pump into its heads, each with its device and its slots", () => {
    const twin = symbol({
      type: "pump_double",
      props: { heads: { b: { device_id: "P-B" } } },
    });
    expect(symbolHeads(twin)).toEqual([
      {
        key: "a",
        deviceId: null,
        slots: ["state_a", "fault_a", "speed_a"],
        state: "state_a",
        fault: "fault_a",
      },
      {
        key: "b",
        deviceId: "P-B",
        slots: ["state_b", "fault_b", "speed_b"],
        state: "state_b",
        fault: "fault_b",
      },
    ]);
    expect(symbolDeviceIds(twin)).toEqual(["P-B"]);
  });

  it("reads a type the registry does not know as one machine with nothing to read", () => {
    expect(symbolHeads(symbol({ type: "reactor", device_id: "R" }))).toEqual([
      { key: null, deviceId: "R", slots: [], state: "state", fault: undefined },
    ]);
  });
});

describe("headSlot", () => {
  it("names the head and the role of a head's slot, nothing for any other", () => {
    expect(headSlot("fault_b")).toEqual({ head: "b", role: "fault" });
    expect(headSlot("state")).toBeUndefined();
  });
});

describe("machineFault", () => {
  const contact = (raw: boolean, stale = false): SlotReading => ({
    text: null,
    unit: null,
    raw,
    stale,
    faulty: false,
  });
  // One controller behind both heads, faulty because head a tripped.
  const twin = symbol({
    type: "pump_double",
    props: { heads: { a: { device_id: "ctl" }, b: { device_id: "ctl" } } },
  });
  const [a, b] = symbolHeads(twin);
  const devices = { ctl: { faulty: true, severity: "warning" as const } };

  it("takes a head's own fault contact over its device's fault", () => {
    const values = {
      slots: {
        "symbol.s.fault_a": contact(true),
        "symbol.s.fault_b": contact(false),
      },
      devices,
    };
    expect(machineFault("s", a, values)).toBe("alert");
    expect(machineFault("s", b, values)).toBeNull();
  });

  it("falls back on the device while the contact is stale or unbound", () => {
    const values = {
      slots: { "symbol.s.fault_a": contact(false, true) },
      devices,
    };
    expect(machineFault("s", a, values)).toBe("warning");
    expect(machineFault("s", b, values)).toBe("warning");
  });

  it("leaves a symbol of one machine to its device, whatever its fault slot reads", () => {
    const pac = symbol({ type: "heat_pump", device_id: "ctl" });
    const values = { slots: { "symbol.s.fault": contact(false) }, devices };
    expect(machineFault("s", symbolHeads(pac)[0], values)).toBe("warning");
  });
});
