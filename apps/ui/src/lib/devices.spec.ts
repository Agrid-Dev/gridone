import type { Device, StandardAttributeSchema } from "@gridone/sdk";
import { describe, expect, it } from "vitest";
import {
  defaultVisibleAttributes,
  DeviceType,
  standardAttributeNames,
  type DeviceAttribute,
} from "./devices";

/** Minimal device carrying only the fields these helpers read. Attribute
 *  values are irrelevant here (only the keys matter), so they are empty. */
function makeDevice(type: string | null, attributeNames: string[]): Device {
  const attributes: Record<string, DeviceAttribute> = {};
  for (const name of attributeNames) {
    attributes[name] = {} as DeviceAttribute;
  }
  return {
    id: "d1",
    name: "Device 1",
    type,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes,
    is_faulty: false,
  };
}

/** A slice of the `/devices/standard-types` catalog. */
const SCHEMAS: StandardAttributeSchema[] = [
  {
    key: "thermostat",
    name: "Thermostat",
    fields: [
      "temperature",
      "temperature_setpoint",
      "onoff_state",
      "mode",
      "fan_speed",
    ].map((name) => ({ name, required: false, data_type: "float" })),
  },
  {
    key: "air_extractor",
    name: "Air extractor",
    fields: ["onoff_state", "fan_speed", "flow_switch"].map((name) => ({
      name,
      required: false,
      data_type: "float",
    })),
  },
];

describe("defaultVisibleAttributes", () => {
  it("selects only the standard attributes present, in schema order", () => {
    // Driver order buries the standard attributes behind firmware/boot
    // metadata (all reported as kind: "standard" on the wire).
    const available = [
      "firmware_version",
      "temperature",
      "mode",
      "boot_mode",
      "fan_speed",
    ];
    const standard = [
      "temperature",
      "temperature_setpoint",
      "mode",
      "fan_speed",
    ];

    // temperature_setpoint is not exposed, so it is skipped; the metadata
    // attributes are excluded entirely — only the 3 present standard ones show.
    expect(defaultVisibleAttributes(available, standard, 8)).toEqual([
      "temperature",
      "mode",
      "fan_speed",
    ]);
  });

  it("caps the standard selection at the limit", () => {
    const attrs = ["a", "b", "c", "d"];
    expect(defaultVisibleAttributes(attrs, attrs, 2)).toEqual(["a", "b"]);
  });

  it("falls back to the first `limit` attributes when none are standard", () => {
    const available = ["a", "b", "c", "d", "e"];
    expect(defaultVisibleAttributes(available, [], 3)).toEqual(["a", "b", "c"]);
  });
});

describe("standardAttributeNames", () => {
  it("returns the schema field names for a matching type", () => {
    expect(
      standardAttributeNames(makeDevice(DeviceType.AirExtractor, []), SCHEMAS),
    ).toEqual(["onoff_state", "fan_speed", "flow_switch"]);
  });

  it("returns an empty list when the type is absent or has no schema", () => {
    expect(standardAttributeNames(makeDevice(null, []), SCHEMAS)).toEqual([]);
    expect(
      standardAttributeNames(makeDevice("mystery_box", []), SCHEMAS),
    ).toEqual([]);
  });
});
