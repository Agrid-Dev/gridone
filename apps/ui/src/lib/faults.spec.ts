import { describe, it, expect } from "vitest";
import { getActiveFaults, isFaultAttribute } from "./faults";
import type { Device, DeviceAttribute, FaultAttribute } from "@/api/devices";

function makeDevice(attributes: Record<string, DeviceAttribute>): Device {
  return {
    id: "d1",
    name: "Device 1",
    type: null,
    tags: {},
    driverId: "drv",
    transportId: "tr",
    config: {},
    attributes,
  };
}

const plain: DeviceAttribute = {
  kind: "standard",
  name: "temperature",
  dataType: "float",
  readWriteModes: ["read"],
  currentValue: 21.5,
  lastUpdated: "2026-04-22T10:00:00Z",
  lastChanged: "2026-04-22T09:00:00Z",
};

const fault = (
  overrides: Partial<FaultAttribute> & {
    severity: FaultAttribute["severity"];
    isFaulty: boolean;
  },
): FaultAttribute => ({
  kind: "fault",
  name: overrides.name ?? "fault_x",
  dataType: "bool",
  readWriteModes: ["read"],
  currentValue: true,
  lastUpdated: "2026-04-22T10:00:00Z",
  lastChanged: "2026-04-22T09:00:00Z",
  ...overrides,
});

describe("isFaultAttribute", () => {
  it("returns true when kind === 'fault'", () => {
    expect(isFaultAttribute(fault({ severity: "alert", isFaulty: true }))).toBe(
      true,
    );
  });

  it("returns false when kind === 'standard'", () => {
    expect(isFaultAttribute(plain)).toBe(false);
  });
});

describe("getActiveFaults", () => {
  it("returns [] when the device has no fault attributes", () => {
    const device = makeDevice({ temperature: plain });
    expect(getActiveFaults(device)).toEqual([]);
  });

  it("filters out fault attributes with isFaulty=false", () => {
    const device = makeDevice({
      a: fault({ name: "a", severity: "alert", isFaulty: false }),
      b: fault({ name: "b", severity: "warning", isFaulty: true }),
    });
    const result = getActiveFaults(device);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("b");
  });

  it("sorts by severity alert > warning > info regardless of timestamps", () => {
    const device = makeDevice({
      i: fault({
        name: "i",
        severity: "info",
        isFaulty: true,
        lastChanged: "2030-01-01T00:00:00Z",
      }),
      a: fault({
        name: "a",
        severity: "alert",
        isFaulty: true,
        lastChanged: "2020-01-01T00:00:00Z",
      }),
      w: fault({
        name: "w",
        severity: "warning",
        isFaulty: true,
        lastChanged: "2025-01-01T00:00:00Z",
      }),
    });
    expect(getActiveFaults(device).map((f) => f.name)).toEqual(["a", "w", "i"]);
  });

  it("within same severity, newer lastChanged comes first", () => {
    const device = makeDevice({
      older: fault({
        name: "older",
        severity: "alert",
        isFaulty: true,
        lastChanged: "2026-04-22T08:00:00Z",
      }),
      newer: fault({
        name: "newer",
        severity: "alert",
        isFaulty: true,
        lastChanged: "2026-04-22T10:00:00Z",
      }),
    });
    expect(getActiveFaults(device).map((f) => f.name)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("null lastChanged sorts to the bottom within a severity group", () => {
    const device = makeDevice({
      noTs: fault({
        name: "noTs",
        severity: "warning",
        isFaulty: true,
        lastChanged: null,
      }),
      withTs: fault({
        name: "withTs",
        severity: "warning",
        isFaulty: true,
        lastChanged: "2026-04-22T10:00:00Z",
      }),
    });
    expect(getActiveFaults(device).map((f) => f.name)).toEqual([
      "withTs",
      "noTs",
    ]);
  });

  it("ignores plain (non-fault) attributes even when present alongside faults", () => {
    const device = makeDevice({
      temp: plain,
      alarm: fault({ name: "alarm", severity: "alert", isFaulty: true }),
    });
    const result = getActiveFaults(device);
    expect(result.map((f) => f.name)).toEqual(["alarm"]);
  });
});
