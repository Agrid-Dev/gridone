import { describe, it, expect } from "vitest";
import {
  DeviceKind,
  devicesFilterToQueryParams,
  getDeviceReadWriteModes,
  isReadOnlyDevice,
  type Device,
  type DeviceAttribute,
} from "./devices";

function makeAttr(readWriteModes: string[]): DeviceAttribute {
  return {
    kind: "standard",
    name: "attr",
    dataType: "float",
    readWriteModes,
    currentValue: null,
    lastUpdated: null,
    lastChanged: null,
  };
}

function makeDevice(attributes: Record<string, DeviceAttribute>): Device {
  return {
    id: "d1",
    kind: DeviceKind.Physical,
    name: "d1",
    type: null,
    tags: {},
    driverId: "drv",
    transportId: "tr",
    config: {},
    attributes,
    isFaulty: false,
  };
}

/** URLSearchParams → plain array of [key, value] pairs in insertion order,
 *  so tests can assert repeat-key semantics (e.g. multi-value ids). */
function entries(params: URLSearchParams): [string, string][] {
  return Array.from(params.entries());
}

describe("devicesFilterToQueryParams", () => {
  it("returns no params for undefined filter", () => {
    expect(entries(devicesFilterToQueryParams(undefined))).toEqual([]);
  });

  it("returns no params for an empty filter object", () => {
    expect(entries(devicesFilterToQueryParams({}))).toEqual([]);
  });

  it("expands ids into repeated 'ids' params", () => {
    expect(entries(devicesFilterToQueryParams({ ids: ["a", "b"] }))).toEqual([
      ["ids", "a"],
      ["ids", "b"],
    ]);
  });

  it("expands types into repeated 'type' params (singular alias)", () => {
    expect(
      entries(devicesFilterToQueryParams({ types: ["thermostat", "awhp"] })),
    ).toEqual([
      ["type", "thermostat"],
      ["type", "awhp"],
    ]);
  });

  it("expands tags into 'tags=key:value' pairs, one per value", () => {
    expect(
      entries(
        devicesFilterToQueryParams({
          tags: { asset_id: ["a1", "a2"], floor: ["3"] },
        }),
      ),
    ).toEqual([
      ["tags", "asset_id:a1"],
      ["tags", "asset_id:a2"],
      ["tags", "floor:3"],
    ]);
  });

  it("serialises isFaulty true and false", () => {
    expect(entries(devicesFilterToQueryParams({ isFaulty: true }))).toEqual([
      ["is_faulty", "true"],
    ]);
    expect(entries(devicesFilterToQueryParams({ isFaulty: false }))).toEqual([
      ["is_faulty", "false"],
    ]);
  });

  it("serialises assetId as an 'asset_id' query param", () => {
    expect(entries(devicesFilterToQueryParams({ assetId: "a1" }))).toEqual([
      ["asset_id", "a1"],
    ]);
  });

  it("maps writableAttribute and writableAttributeType to snake_case keys", () => {
    expect(
      entries(
        devicesFilterToQueryParams({
          writableAttribute: "setpoint",
          writableAttributeType: "float",
        }),
      ),
    ).toEqual([
      ["writable_attribute", "setpoint"],
      ["writable_attribute_type", "float"],
    ]);
  });

  it("omits empty arrays and undefined scalars", () => {
    expect(
      entries(
        devicesFilterToQueryParams({
          ids: [],
          types: [],
          tags: {},
          isFaulty: undefined,
          writableAttribute: undefined,
        }),
      ),
    ).toEqual([]);
  });

  it("serialises a combined filter in a stable order", () => {
    expect(
      entries(
        devicesFilterToQueryParams({
          ids: ["d1"],
          types: ["thermostat"],
          tags: { asset_id: ["a1"] },
          isFaulty: false,
          writableAttribute: "mode",
        }),
      ),
    ).toEqual([
      ["ids", "d1"],
      ["type", "thermostat"],
      ["tags", "asset_id:a1"],
      ["is_faulty", "false"],
      ["writable_attribute", "mode"],
    ]);
  });
});

describe("getDeviceReadWriteModes / isReadOnlyDevice", () => {
  it("unions modes across attributes", () => {
    const device = makeDevice({
      temperature: makeAttr(["read"]),
      setpoint: makeAttr(["read", "write"]),
    });
    expect([...getDeviceReadWriteModes(device)].sort()).toEqual([
      "read",
      "write",
    ]);
    expect(isReadOnlyDevice(device)).toBe(false);
  });

  it("is read-only when no attribute supports writing", () => {
    const device = makeDevice({
      temperature: makeAttr(["read"]),
      humidity: makeAttr(["read"]),
    });
    expect(isReadOnlyDevice(device)).toBe(true);
  });

  it("treats a device with no attributes as read-only", () => {
    expect(isReadOnlyDevice(makeDevice({}))).toBe(true);
  });
});
