import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import { DeviceType } from "@/lib/devices";
import type { FleetStatus } from "./fleet-status";
import { getFleetStatus } from "./registry";

function device(type: string | null, attributes: Record<string, unknown>) {
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
      Object.entries(attributes).map(([name, value]) => [
        name,
        { name, kind: "standard", current_value: value },
      ]),
    ),
  } as unknown as Device;
}

const status = (type: string | null, attributes: Record<string, unknown>) =>
  getFleetStatus(type)(device(type, attributes));

const running = (mode: string | null): FleetStatus => ({
  activity: "active",
  runStatus: { run: "running", mode },
});

describe("fleet status", () => {
  it.each<[string, string, Record<string, unknown>, FleetStatus]>([
    // Thermostat: on/off and the mode it regulates in.
    [
      "thermostat heating",
      DeviceType.Thermostat,
      { onoff_state: true, mode: "heat" },
      running("heat"),
    ],
    [
      "thermostat cooling",
      DeviceType.Thermostat,
      { onoff_state: true, mode: "cool" },
      running("cool"),
    ],
    [
      "thermostat switched off with a mode still configured",
      DeviceType.Thermostat,
      { onoff_state: false, mode: "heat" },
      { activity: "idle", runStatus: { run: "stopped", mode: "heat" } },
    ],
    [
      "thermostat reporting a mode but no on/off switch",
      DeviceType.Thermostat,
      { mode: "auto" },
      running("auto"),
    ],
    [
      "thermostat reporting neither",
      DeviceType.Thermostat,
      { temperature: 21 },
      { activity: "unknown", runStatus: { run: "unknown", mode: null } },
    ],
    // Air handlers: the coil takes the battery that is open; hvac_mode only
    // when no valve is reported.
    [
      "double-flux AHU with no valve, on its hvac_mode",
      DeviceType.AhuDoubleFlux,
      { onoff_state: true, hvac_mode: "cool" },
      running("cool"),
    ],
    [
      "double-flux AHU heating through its open heating valve",
      DeviceType.AhuDoubleFlux,
      {
        onoff_state: true,
        hvac_mode: "cool",
        heating_valve: 40,
        cooling_valve: 0,
      },
      running("heat"),
    ],
    [
      "single-flux AHU cooling through its open cooling valve",
      DeviceType.AhuSingleFlux,
      { onoff_state: true, heating_valve: 0, cooling_valve: 65 },
      running("cool"),
    ],
    [
      "single-flux AHU ventilating, both batteries shut",
      DeviceType.AhuSingleFlux,
      {
        onoff_state: true,
        hvac_mode: "heat",
        heating_valve: 0,
        cooling_valve: 0,
      },
      running(null),
    ],
    [
      "single-flux AHU switched off",
      DeviceType.AhuSingleFlux,
      { onoff_state: false, hvac_mode: "heat" },
      { activity: "idle", runStatus: { run: "stopped", mode: "heat" } },
    ],
    [
      "heat pump switched off",
      DeviceType.Awhp,
      { onoff_state: false },
      { activity: "idle", runStatus: { run: "stopped", mode: null } },
    ],
    [
      "heat pump heating",
      DeviceType.Awhp,
      { onoff_state: true, mode: "heat" },
      running("heat"),
    ],
  ])("%s", (_, type, attributes, expected) => {
    expect(status(type, attributes)).toEqual(expected);
  });

  it.each<[string, FleetStatus["activity"], string, Record<string, unknown>]>([
    // Run-state types: their lead words the state, so no status line.
    ["extractor on", "active", DeviceType.AirExtractor, { onoff_state: true }],
    [
      "extractor commanded on but moving no air",
      "idle",
      DeviceType.AirExtractor,
      { onoff_state: true, flow_switch: false },
    ],
    ["extractor reporting nothing", "unknown", DeviceType.AirExtractor, {}],
    ["pump running", "active", DeviceType.Pump, { onoff_state: true }],
    ["pump stopped", "idle", DeviceType.Pump, { onoff_state: false }],
    ["pump reporting nothing", "unknown", DeviceType.Pump, {}],
    // Sensors: active while they report what they lead with.
    [
      "meter reporting its power",
      "active",
      DeviceType.ElectricityMeter,
      { active_power: 240 },
    ],
    [
      "meter reporting only its index",
      "unknown",
      DeviceType.ElectricityMeter,
      { index: 48210 },
    ],
    [
      "weather sensor reporting the sky",
      "active",
      DeviceType.WeatherSensor,
      { weather_code: 63 },
    ],
    [
      "weather sensor reporting only its temperature",
      "active",
      DeviceType.WeatherSensor,
      { temperature: 12.4 },
    ],
    [
      "weather sensor reporting nothing",
      "unknown",
      DeviceType.WeatherSensor,
      {},
    ],
    [
      "leak detector wet",
      "active",
      DeviceType.LiquidDetector,
      { liquid_detected: true },
    ],
    [
      "leak detector dry",
      "active",
      DeviceType.LiquidDetector,
      { liquid_detected: false },
    ],
    ["leak detector not reported", "unknown", DeviceType.LiquidDetector, {}],
    [
      "PMS monitor with a booking",
      "active",
      DeviceType.PmsMonitor,
      { reservation_status: "booked" },
    ],
    ["PMS monitor not reported", "unknown", DeviceType.PmsMonitor, {}],
  ])("%s: %s, no status line", (_, activity, type, attributes) => {
    expect(status(type, attributes)).toEqual({ activity, runStatus: null });
  });

  it.each([
    ["an untyped device", null],
    ["a type the UI does not know", "vendor_box"],
  ])("has nothing to judge by for %s", (_, type) => {
    expect(status(type as string | null, { temperature: 21 })).toEqual({
      activity: "unknown",
      runStatus: null,
    });
  });
});
