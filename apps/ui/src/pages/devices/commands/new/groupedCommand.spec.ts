import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import {
  constraintWarnings,
  parseCommandValue,
  valueMatchesType,
} from "./groupedCommand";
import {
  currentValueFor,
  deviceMatchesFilter,
  resolveAssetSubtreeIds,
} from "./resolvers";
import type { AssetTreeNode } from "@/lib/assets";

const device = (value: unknown): Device => ({
  id: "device",
  name: "Device",
  driver_id: "driver",
  transport_id: "transport",
  tags: { asset_id: "room" },
  config: {},
  attributes: { target: { current_value: value, read_write_modes: ["write"] } },
});

describe("command values", () => {
  it.each([false, 0, "21", "heat"])(
    "preserves the type of %s through the URL",
    (value) => {
      expect(parseCommandValue(JSON.stringify(value))).toBe(value);
    },
  );
  it.each(["null", "[]", "{}", "", "1e999"])(
    "rejects invalid URL value %s",
    (raw) => {
      expect(parseCommandValue(raw)).toBeUndefined();
    },
  );
  it("supports a plain string in hand-authored links", () =>
    expect(parseCommandValue("heat")).toBe("heat"));
  it.each([
    [false, "bool", true],
    [0, "int", true],
    [2.5, "int", false],
    ["21", "float", false],
    [true, "str", false],
    [NaN, "float", false],
  ])("validates %s as %s", (value, type, valid) => {
    expect(
      valueMatchesType(value as string | number | boolean, String(type)),
    ).toBe(valid);
  });
  it("prefills only a known unanimous value, including zero and false", () => {
    for (const value of [0, false, "heat"])
      expect(currentValueFor([device(value), device(value)], "target")).toBe(
        value,
      );
    expect(currentValueFor([device(19), device(21)], "target")).toBeUndefined();
    expect(
      currentValueFor([device(21), device(null)], "target"),
    ).toBeUndefined();
    expect(currentValueFor([], "target")).toBeUndefined();
  });
});

describe("preview constraints", () => {
  it("checks literal and referenced bounds and the zero-anchored step grid", () => {
    const d = device(21);
    d.attributes = {
      target: {
        write_constraints: {
          minimum: { attribute: "min" },
          maximum: 25,
          step: 0.5,
        },
      },
      min: { current_value: 19 },
    };
    expect(constraintWarnings(d, "target", 18.1)).toEqual({
      dynamic: true,
      warnings: [
        { kind: "minimum", bound: 19 },
        { kind: "step", bound: 0.5 },
      ],
    });
    expect(constraintWarnings(d, "target", 26).warnings).toEqual([
      { kind: "maximum", bound: 25 },
    ]);
    expect(constraintWarnings(d, "target", 21.5).warnings).toEqual([]);
  });
  it("leaves unknown reference bounds to the server", () => {
    const d = device(21);
    d.attributes = {
      target: { write_constraints: { maximum: { attribute: "missing" } } },
    };
    expect(constraintWarnings(d, "target", 99)).toEqual({
      dynamic: true,
      warnings: [],
    });
  });
});

it("expands scope with empty descendants and applies tags without widening empty id lists", () => {
  const tree: AssetTreeNode[] = [
    {
      id: "building",
      name: "Building",
      type: "building",
      children: [
        { id: "room", name: "Room", type: "room", children: [] },
        { id: "empty-room", name: "Empty", type: "room", children: [] },
      ],
    },
  ];
  expect(resolveAssetSubtreeIds(tree, "building")).toEqual([
    "building",
    "room",
    "empty-room",
  ]);
  expect(resolveAssetSubtreeIds(tree, "missing")).toEqual([]);
  expect(
    deviceMatchesFilter(device(21), {
      tags: { asset_id: ["building", "room"] },
    }),
  ).toBe(true);
  expect(
    deviceMatchesFilter(device(21), { tags: { asset_id: ["other"] } }),
  ).toBe(false);
  expect(deviceMatchesFilter(device(21), { ids: [] })).toBe(false);
});
