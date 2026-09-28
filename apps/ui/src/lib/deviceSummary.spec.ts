import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import {
  countByConnectionStatus,
  deviceMeasureReading,
  formatReading,
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

  it.each([
    [
      "weather_sensor",
      { temperature: { current_value: 14.2, unit: "°C" } },
      "14.2 °C",
    ],
    [
      "electricity_meter",
      { active_power: { current_value: 2.4, unit: "kW" } },
      "2 kW",
    ],
    [
      "thermostat",
      { temperature: { current_value: 70.1, unit: "°F" } },
      "70.1 °F",
    ],
  ])(
    "%s uses the unit its driver declares → %s",
    (type, attributes, expected) => {
      expect(measure(type, attributes)).toBe(expected);
    },
  );

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
