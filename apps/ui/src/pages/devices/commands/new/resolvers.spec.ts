import { describe, it, expect } from "vitest";
import type { Device } from "@gridone/sdk";
import type { DeviceAttribute } from "@/lib/devices";
import {
  resolveFilter,
  targetFilterToDevicesFilter,
  valueOptionsFor,
} from "./resolvers";

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

function device(
  attributes: DeviceAttribute[],
  overrides?: Partial<Device>,
): Device {
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
    ...overrides,
  };
}

describe("valueOptionsFor", () => {
  it("returns the options when the single device exposing the attribute has them", () => {
    const d = device([
      attr("mode", {
        writable: true,
        valueOptions: ["heat", "cool", "fan", "auto"],
      }),
    ]);
    expect(valueOptionsFor([d], "mode")).toEqual([
      "heat",
      "cool",
      "fan",
      "auto",
    ]);
  });

  it("intersects only over devices exposing the attribute as writable", () => {
    // Union semantics: d2 doesn't expose `mode` at all and d3 exposes it
    // read-only — both are excluded at dispatch, so they must not veto the
    // exposing device's option list.
    const d1 = device([
      attr("mode", { writable: true, valueOptions: ["heat", "cool"] }),
    ]);
    const d2 = device([attr("setpoint", { writable: true })], { id: "d2" });
    const d3 = device([attr("mode", { writable: false })], { id: "d3" });
    expect(valueOptionsFor([d1, d2, d3], "mode")).toEqual(["heat", "cool"]);
  });

  it("is undefined when exposing devices disagree on the option list", () => {
    const d1 = device([
      attr("mode", { writable: true, valueOptions: ["heat", "cool"] }),
    ]);
    const d2 = device(
      [attr("mode", { writable: true, valueOptions: ["heat"] })],
      { id: "d2" },
    );
    expect(valueOptionsFor([d1, d2], "mode")).toBeUndefined();
  });

  it("is undefined when any exposing device has no options", () => {
    const d1 = device([
      attr("mode", { writable: true, valueOptions: ["heat", "cool"] }),
    ]);
    const d2 = device([attr("mode", { writable: true })], { id: "d2" });
    expect(valueOptionsFor([d1, d2], "mode")).toBeUndefined();
  });

  it("is undefined when no selected device exposes the attribute as writable", () => {
    const d = device([attr("mode", { writable: false })]);
    expect(valueOptionsFor([d], "mode")).toBeUndefined();
  });
});

describe("targetFilterToDevicesFilter", () => {
  // Regression: the wizard used to pass the form-state ``{assetId}`` shape
  // straight into resolveFilter (which reads ``asset_id``), so the asset
  // constraint silently no-oped in the filters-mode preview.
  it("maps the form-state assetId onto asset_id so the preview applies it", () => {
    const inAsset = device([], {
      id: "in",
      type: "thermostat",
      tags: { asset_id: "a1" },
    });
    const outOfAsset = device([], {
      id: "out",
      type: "thermostat",
      tags: { asset_id: "a2" },
    });

    const filter = targetFilterToDevicesFilter({ assetId: "a1" });
    expect(filter).toEqual({ types: undefined, asset_id: "a1" });

    const resolved = resolveFilter([inAsset, outOfAsset], filter);
    expect(resolved.map((d) => d.id)).toEqual(["in"]);
  });
});
