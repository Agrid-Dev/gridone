import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import { DeviceType } from "@/lib/devices";
import { getFleetLead } from "./registry";
import type { FleetLead, FleetLeadContext } from "./types";

/** Returns the key, with any `count` / `date` appended, so leads are asserted
 *  against the label keys they pick. */
const t = ((key: string, opts?: Record<string, unknown>) =>
  opts
    ? `${key}(${Object.values(opts).join(",")})`
    : key) as FleetLeadContext["t"];

const ctx: FleetLeadContext = { t, locale: "en" };

type Attr = { value: unknown; unit?: string };

function device(
  type: string | null,
  attributes: Record<string, unknown | Attr>,
): Device {
  return {
    id: "d1",
    name: "Device",
    type,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    is_faulty: false,
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([name, raw]) => {
        const attr =
          raw && typeof raw === "object" && "value" in raw
            ? (raw as Attr)
            : { value: raw };
        return [
          name,
          { name, current_value: attr.value, unit: attr.unit ?? null },
        ];
      }),
    ),
  } as unknown as Device;
}

const lead = (type: string | null, attributes = {}) =>
  getFleetLead(type)(device(type, attributes), ctx);

const L = "devices.card.lead";

describe("fleet leads", () => {
  it.each<[string, string, Record<string, unknown>, FleetLead]>([
    [
      "thermostat: setpoint, then the room it measures",
      DeviceType.Thermostat,
      { temperature_setpoint: 21, temperature: 19.64 },
      {
        primary: { value: "21.0°", label: `${L}.setpoint` },
        secondary: { value: "19.6°", label: `${L}.measured` },
      },
    ],
    [
      "thermostat in fan mode: the setpoint reads N/A, whatever it reports",
      DeviceType.Thermostat,
      { mode: "fan", temperature_setpoint: 0, temperature: 21.5 },
      {
        primary: { value: "N/A", label: `${L}.setpoint` },
        secondary: { value: "21.5°", label: `${L}.measured` },
      },
    ],
    [
      "thermostat without setpoint: the measure leads alone",
      DeviceType.Thermostat,
      { temperature: 19.6 },
      { primary: { value: "19.6°", label: `${L}.measured` } },
    ],
    [
      "double-flow AHU: setpoint, then supply air",
      DeviceType.AhuDoubleFlux,
      { supply_air_temperature_setpoint: 18, supply_air_temperature: 19.2 },
      {
        primary: { value: "18.0°", label: `${L}.setpoint` },
        secondary: { value: "19.2°", label: `${L}.supplyAir` },
      },
    ],
    [
      "single-flow AHU: setpoint, then supply air",
      DeviceType.AhuSingleFlux,
      { supply_air_temperature_setpoint: 17, supply_air_temperature: 21.1 },
      {
        primary: { value: "17.0°", label: `${L}.setpoint` },
        secondary: { value: "21.1°", label: `${L}.supplyAir` },
      },
    ],
    [
      "heat pump: setpoint, then outlet water",
      DeviceType.Awhp,
      { setpoint_temperature: 45, outlet_temperature: 38.2 },
      {
        primary: { value: "45.0°", label: `${L}.setpoint` },
        secondary: { value: "38.2°", label: `${L}.outlet` },
      },
    ],
    [
      "weather sensor: temperature, then the sky in words",
      DeviceType.WeatherSensor,
      { temperature: 14.2, weather_code: 2 },
      {
        primary: { value: "14.2°" },
        secondary: { value: "controls.weatherCodes.partlyCloudy" },
      },
    ],
    [
      "meter: power, then counted energy in its declared unit",
      DeviceType.ElectricityMeter,
      { active_power: 240, energy: { value: 12345, unit: "kWh" } },
      {
        primary: { value: "240 W", label: `${L}.power` },
        secondary: { value: "12,345 kWh", label: `${L}.energy` },
      },
    ],
    [
      "meter without energy: its index instead",
      DeviceType.ElectricityMeter,
      { active_power: 240, index: 812 },
      {
        primary: { value: "240 W", label: `${L}.power` },
        secondary: { value: "812", label: `${L}.index` },
      },
    ],
    [
      "extractor running: the state, then its speed",
      DeviceType.AirExtractor,
      { onoff_state: true, fan_speed: 80 },
      {
        primary: { value: `${L}.runState.running`, tone: "text-foreground" },
        secondary: { value: "80 %", label: `${L}.speed` },
      },
    ],
    [
      "extractor stopped: no speed",
      DeviceType.AirExtractor,
      { onoff_state: false, fan_speed: 80 },
      {
        primary: {
          value: `${L}.runState.stopped`,
          tone: "text-muted-foreground",
        },
        secondary: null,
      },
    ],
    [
      "pump: the state in words, in the foreground, and no reading",
      DeviceType.Pump,
      { onoff_state: true, head: 4.2 },
      { primary: { value: `${L}.runState.running`, tone: "text-foreground" } },
    ],
    [
      "leak detector: the verdict in its tone",
      DeviceType.LiquidDetector,
      { liquid_detected: true },
      {
        primary: {
          value: "standardDevices:liquid_detector.detected",
          tone: "text-water",
        },
      },
    ],
    [
      "PMS monitor: an occupied room and its guests",
      DeviceType.PmsMonitor,
      { reservation_status: "checked_in", guest_count: 2 },
      {
        primary: {
          value: "devices.card.pms.status.checkedIn",
          tone: "text-primary",
        },
        secondary: { value: "devices.card.pms.guests(2)" },
      },
    ],
    [
      "a device of no registered type: an em dash",
      "vendor_box",
      { anything: 3 },
      { primary: { value: "—" } },
    ],
  ])("%s", (_, type, attributes, expected) => {
    expect(lead(type, attributes)).toEqual(expected);
  });

  it.each([
    [DeviceType.Thermostat, {}],
    [DeviceType.LiquidDetector, {}],
    [DeviceType.WeatherSensor, {}],
  ])("%s that never reported leads with an em dash", (type, attributes) => {
    expect(lead(type, attributes).primary.value).toBe("—");
  });

  it.each([0, 21, null])(
    "thermostat in fan mode reads its setpoint N/A whatever it reports (%s)",
    (setpoint) => {
      expect(
        lead(DeviceType.Thermostat, {
          mode: "fan",
          temperature_setpoint: setpoint,
          temperature: 21.5,
        }),
      ).toEqual({
        primary: { value: "N/A", label: `${L}.setpoint` },
        secondary: { value: "21.5°", label: `${L}.measured` },
      });
    },
  );

  it.each(["heat", "cool", "auto", null])(
    "thermostat keeps a reported zero setpoint in mode %s",
    (mode) => {
      expect(
        lead(DeviceType.Thermostat, { mode, temperature_setpoint: 0 }).primary,
      ).toEqual({ value: "0.0°", label: `${L}.setpoint` });
    },
  );

  it("takes the unit the driver declares for a setpoint and its measure", () => {
    expect(
      lead(DeviceType.Awhp, {
        setpoint_temperature: { value: 45, unit: "°C" },
        outlet_temperature: { value: 38.2, unit: "°C" },
      }),
    ).toMatchObject({
      primary: { value: "45.0 °C" },
      secondary: { value: "38.2 °C" },
    });
  });

  it("takes the unit the driver declares", () => {
    expect(
      lead(DeviceType.Thermostat, {
        temperature_setpoint: { value: 21, unit: "°C" },
        temperature: { value: 19.6, unit: "°C" },
      }),
    ).toMatchObject({
      primary: { value: "21.0 °C" },
      secondary: { value: "19.6 °C" },
    });
  });
});
