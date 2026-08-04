import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import {
  countByConnectionStatus,
  deviceMeasure,
  deviceMode,
  deviceSetpoint,
} from "./deviceSummary";

function device(
  type: string | null,
  attributes: Record<string, unknown> = {},
): Device {
  return {
    id: "d1",
    name: "Device",
    type,
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes,
  } as Device;
}

const attr = (value: unknown) => ({ current_value: value });

describe("deviceMeasure", () => {
  it.each([
    ["thermostat", { temperature: attr(20.52) }, "20.5°"],
    ["awhp", { outlet_temperature: attr(38.4) }, "38.4°"],
    ["ahu_double_flux", { supply_air_temperature: attr(19.2) }, "19.2°"],
    ["ahu_single_flux", { supply_air_temperature: attr(19.26) }, "19.3°"],
    ["electricity_meter", { active_power: attr(1250.4) }, "1250 W"],
    ["weather_sensor", { temperature: attr(12.34) }, "12.3°"],
    ["air_extractor", { fan_speed: attr(82) }, "82 %"],
  ])("%s → %s", (type, attributes, expected) => {
    expect(deviceMeasure(device(type, attributes))).toBe(expected);
  });

  it("falls back to an em dash when the attribute is absent", () => {
    expect(deviceMeasure(device("thermostat"))).toBe("—");
  });

  it("falls back to an em dash for unknown or untyped devices", () => {
    expect(deviceMeasure(device(null))).toBe("—");
    expect(deviceMeasure(device("custom"))).toBe("—");
  });
});

describe("deviceSetpoint", () => {
  it.each([
    ["thermostat", { temperature_setpoint: attr(21) }, "21.0°"],
    ["awhp", { setpoint_temperature: attr(40) }, "40.0°"],
    ["ahu_double_flux", { supply_air_temperature_setpoint: attr(19) }, "19.0°"],
    [
      "ahu_single_flux",
      { supply_air_temperature_setpoint: attr(19.5) },
      "19.5°",
    ],
  ])("%s → %s", (type, attributes, expected) => {
    expect(deviceSetpoint(device(type, attributes))).toBe(expected);
  });

  it.each(["electricity_meter", "weather_sensor", "air_extractor"])(
    "%s has no setpoint",
    (type) => {
      expect(deviceSetpoint(device(type))).toBe("—");
    },
  );

  it("falls back to an em dash when the attribute is absent", () => {
    expect(deviceSetpoint(device("thermostat"))).toBe("—");
  });
});

describe("deviceMode", () => {
  it("returns the mode value when the unit is on", () => {
    const d = device("thermostat", {
      onoff_state: attr(true),
      mode: attr("heat"),
    });
    expect(deviceMode(d)).toEqual({
      kind: "mode",
      attribute: "mode",
      value: "heat",
    });
  });

  it("composes off from onoff_state=false, winning over the mode", () => {
    const d = device("thermostat", {
      onoff_state: attr(false),
      mode: attr("heat"),
    });
    expect(deviceMode(d)).toEqual({ kind: "onoff", value: "off" });
  });

  it("keeps the mode when onoff_state is unknown", () => {
    const d = device("awhp", { mode: attr("cool") });
    expect(deviceMode(d)).toEqual({
      kind: "mode",
      attribute: "mode",
      value: "cool",
    });
  });

  it("reads hvac_mode on air handling units", () => {
    const d = device("ahu_single_flux", { hvac_mode: attr("fan") });
    expect(deviceMode(d)).toEqual({
      kind: "mode",
      attribute: "hvac_mode",
      value: "fan",
    });
  });

  it("maps the air extractor's onoff to on/off", () => {
    expect(
      deviceMode(device("air_extractor", { onoff_state: attr(true) })),
    ).toEqual({ kind: "onoff", value: "on" });
    expect(
      deviceMode(device("air_extractor", { onoff_state: attr(false) })),
    ).toEqual({ kind: "onoff", value: "off" });
    expect(deviceMode(device("air_extractor"))).toBeNull();
  });

  it.each([
    ["thermostat", {}],
    ["electricity_meter", { active_power: attr(100) }],
    ["weather_sensor", {}],
    [null, {}],
  ])("%s without mode data → null", (type, attributes) => {
    expect(deviceMode(device(type, attributes))).toBeNull();
  });
});

describe("countByConnectionStatus", () => {
  it("tallies each status and skips devices without one", () => {
    const counts = countByConnectionStatus([
      device("thermostat", { connection_status: attr("ok") }),
      device("thermostat", { connection_status: attr("ok") }),
      device("thermostat", { connection_status: attr("degraded") }),
      device("thermostat", { connection_status: attr("error") }),
      device("thermostat", { connection_status: attr("idle") }),
      device("thermostat", { connection_status: attr("garbage") }),
      device("thermostat"),
    ]);
    expect(counts).toEqual({ ok: 2, degraded: 1, error: 1, idle: 1 });
  });
});
