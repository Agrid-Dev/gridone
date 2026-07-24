import type { Device } from "@gridone/sdk";
import { describe, expect, it } from "vitest";
import {
  attributeNamesStandardFirst,
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

describe("attributeNamesStandardFirst", () => {
  it("puts a thermostat's standard attributes first, ahead of driver-order ones", () => {
    // Driver declaration order buries the meaningful attributes behind
    // firmware/boot metadata (all reported as kind: "standard" on the wire).
    const device = makeDevice(DeviceType.Thermostat, [
      "firmware_version",
      "boot_mode",
      "bootloader_version",
      "temperature",
      "temperature_setpoint",
      "mode",
      "fan_speed",
      "onoff_state",
    ]);

    expect(attributeNamesStandardFirst(device)).toEqual([
      "temperature",
      "temperature_setpoint",
      "onoff_state",
      "mode",
      "fan_speed",
      "firmware_version",
      "boot_mode",
      "bootloader_version",
    ]);
  });

  it("only promotes standard attributes the device actually declares", () => {
    const device = makeDevice(DeviceType.Thermostat, [
      "boot_mode",
      "temperature",
      "mode",
    ]);

    // temperature_setpoint / fan_speed are not declared, so they are skipped.
    expect(attributeNamesStandardFirst(device)).toEqual([
      "temperature",
      "mode",
      "boot_mode",
    ]);
  });

  it("keeps declaration order for a device with no standard type", () => {
    const names = ["b_attr", "a_attr", "temperature"];
    const device = makeDevice(null, names);

    expect(attributeNamesStandardFirst(device)).toEqual(names);
  });
});

describe("standardAttributeNames", () => {
  it("returns the ordered schema names for a known type", () => {
    expect(
      standardAttributeNames(makeDevice(DeviceType.AirExtractor, [])),
    ).toEqual(["onoff_state", "fan_speed", "flow_switch"]);
  });

  it("returns an empty list for an unknown or absent type", () => {
    expect(standardAttributeNames(makeDevice(null, []))).toEqual([]);
    expect(standardAttributeNames(makeDevice("mystery_box", []))).toEqual([]);
  });
});
