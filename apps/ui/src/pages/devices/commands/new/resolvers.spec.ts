import { describe, it, expect } from "vitest";
import type { Device } from "@gridone/sdk";
import type { DeviceAttribute } from "@/lib/devices";
import { intersectWritableAttributes } from "./resolvers";

function attr(
  name: string,
  opts?: {
    writable?: boolean;
    dataType?: string;
    valueOptions?: (string | number | boolean)[];
  },
): DeviceAttribute {
  return {
    kind: "standard",
    name,
    data_type: opts?.dataType ?? "str",
    read_write_modes: opts?.writable ? ["read", "write"] : ["read"],
    current_value: null,
    last_updated: null,
    last_changed: null,
    value_options: opts?.valueOptions,
  };
}

function device(attributes: DeviceAttribute[]): Device {
  return {
    id: "d1",
    name: "Device",
    type: null,
    driver_id: "drv",
    transport_id: "trp",
    config: {},
    tags: {},
    is_faulty: false,
    attributes: Object.fromEntries(
      attributes.map((a) => [a.name as string, a]),
    ),
  };
}

describe("intersectWritableAttributes", () => {
  it("returns empty list when no devices", () => {
    expect(intersectWritableAttributes([])).toEqual([]);
  });

  it("includes only writable attributes", () => {
    const d = device([
      attr("mode", { writable: true }),
      attr("temperature", { writable: false }),
    ]);
    const result = intersectWritableAttributes([d]);
    expect(result.map((a) => a.name)).toEqual(["mode"]);
  });

  it("includes valueOptions when the single device has them", () => {
    const d = device([
      attr("mode", {
        writable: true,
        valueOptions: ["heat", "cool", "fan", "auto"],
      }),
    ]);
    const [result] = intersectWritableAttributes([d]);
    expect(result.valueOptions).toEqual(["heat", "cool", "fan", "auto"]);
  });

  it("includes valueOptions when all devices agree on the same list", () => {
    const d1 = device([
      attr("mode", { writable: true, valueOptions: ["heat", "cool"] }),
    ]);
    const d2 = device([
      attr("mode", { writable: true, valueOptions: ["heat", "cool"] }),
    ]);
    const [result] = intersectWritableAttributes([d1, d2]);
    expect(result.valueOptions).toEqual(["heat", "cool"]);
  });

  it("omits valueOptions when devices disagree on the option list", () => {
    const d1 = device([
      attr("mode", { writable: true, valueOptions: ["heat", "cool"] }),
    ]);
    const d2 = device([
      attr("mode", { writable: true, valueOptions: ["heat"] }),
    ]);
    const [result] = intersectWritableAttributes([d1, d2]);
    expect(result.valueOptions).toBeUndefined();
  });

  it("omits valueOptions when any device has none", () => {
    const d1 = device([
      attr("mode", { writable: true, valueOptions: ["heat", "cool"] }),
    ]);
    const d2 = device([attr("mode", { writable: true })]);
    const [result] = intersectWritableAttributes([d1, d2]);
    expect(result.valueOptions).toBeUndefined();
  });

  it("omits the attribute when not shared across all devices", () => {
    const d1 = device([attr("mode", { writable: true })]);
    const d2 = device([attr("setpoint", { writable: true })]);
    const result = intersectWritableAttributes([d1, d2]);
    expect(result).toEqual([]);
  });

  it("omits the attribute when data types differ across devices", () => {
    const d1 = device([attr("value", { writable: true, dataType: "int" })]);
    const d2 = device([attr("value", { writable: true, dataType: "str" })]);
    expect(intersectWritableAttributes([d1, d2])).toEqual([]);
  });
});
