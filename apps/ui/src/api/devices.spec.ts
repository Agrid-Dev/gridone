import { describe, it, expect } from "vitest";
import { devicesFilterToQueryParams } from "./devices";

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
