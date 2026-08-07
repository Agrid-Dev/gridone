import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import {
  countByConnectionStatus,
  deviceMeasureReading,
  deviceMode,
  deviceSetpointReading,
  formatReading,
  formatReadingDelta,
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

/** Formatted through the English locale, the one the specs assert against. */
const measure = (type: string | null, attributes = {}) =>
  formatReading(deviceMeasureReading(device(type, attributes)), "en");
const setpoint = (type: string | null, attributes = {}) =>
  formatReading(deviceSetpointReading(device(type, attributes)), "en");

describe("deviceMeasureReading", () => {
  it.each([
    ["thermostat", { temperature: attr(20.52) }, "20.5°"],
    ["awhp", { outlet_temperature: attr(38.4) }, "38.4°"],
    ["ahu_double_flux", { supply_air_temperature: attr(19.2) }, "19.2°"],
    ["ahu_single_flux", { supply_air_temperature: attr(19.26) }, "19.3°"],
    ["electricity_meter", { active_power: attr(1250.4) }, "1,250 W"],
    ["weather_sensor", { temperature: attr(12.34) }, "12.3°"],
    ["air_extractor", { fan_speed: attr(82) }, "82 %"],
  ])("%s → %s", (type, attributes, expected) => {
    expect(measure(type, attributes)).toBe(expected);
  });

  it("names the recorded metric the value comes from", () => {
    expect(
      deviceMeasureReading(device("awhp", { outlet_temperature: attr(38.4) })),
    ).toMatchObject({ metric: "outlet_temperature", value: 38.4 });
  });

  it("formats through the given locale", () => {
    const reading = deviceMeasureReading(
      device("thermostat", { temperature: attr(21.4) }),
    );
    expect(formatReading(reading, "fr")).toBe("21,4°");
  });

  it("falls back to an em dash when the attribute is absent", () => {
    expect(measure("thermostat")).toBe("—");
  });

  it("falls back to an em dash for unknown or untyped devices", () => {
    expect(measure(null)).toBe("—");
    expect(measure("custom")).toBe("—");
  });
});

describe("deviceSetpointReading", () => {
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
    expect(setpoint(type, attributes)).toBe(expected);
  });

  it.each(["electricity_meter", "weather_sensor", "air_extractor"])(
    "%s has no setpoint",
    (type) => {
      expect(setpoint(type)).toBe("—");
    },
  );

  it("falls back to an em dash when the attribute is absent", () => {
    expect(setpoint("thermostat")).toBe("—");
  });
});

describe("formatReadingDelta", () => {
  const thermostat = (attributes: Record<string, unknown>) =>
    device("thermostat", attributes);

  it.each([
    [{ temperature: attr(21.4), temperature_setpoint: attr(21) }, "+0.4°"],
    [{ temperature: attr(19.2), temperature_setpoint: attr(21) }, "-1.8°"],
    [{ temperature: attr(21), temperature_setpoint: attr(21) }, "+0.0°"],
  ])("%o → %s", (attributes, expected) => {
    const d = thermostat(attributes);
    expect(
      formatReadingDelta(
        deviceMeasureReading(d),
        deviceSetpointReading(d),
        "en",
      ),
    ).toBe(expected);
  });

  it("returns null when either side is missing", () => {
    const noSetpoint = thermostat({ temperature: attr(21.4) });
    expect(
      formatReadingDelta(
        deviceMeasureReading(noSetpoint),
        deviceSetpointReading(noSetpoint),
        "en",
      ),
    ).toBeNull();

    const meter = device("electricity_meter", { active_power: attr(120) });
    expect(
      formatReadingDelta(
        deviceMeasureReading(meter),
        deviceSetpointReading(meter),
        "en",
      ),
    ).toBeNull();
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
