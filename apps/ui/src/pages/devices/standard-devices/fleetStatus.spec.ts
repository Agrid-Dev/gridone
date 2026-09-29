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
  activity: "running",
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
    // A mode of `off` stops the unit, with or without an on/off switch —
    // an air handler may report only its hvac_mode.
    [
      "single-flux AHU reporting only hvac_mode off, batteries shut",
      DeviceType.AhuSingleFlux,
      { hvac_mode: "off", heating_valve: 0, cooling_valve: 0 },
      { activity: "idle", runStatus: { run: "stopped", mode: null } },
    ],
    [
      "double-flux AHU reporting only hvac_mode off",
      DeviceType.AhuDoubleFlux,
      { hvac_mode: "off" },
      { activity: "idle", runStatus: { run: "stopped", mode: "off" } },
    ],
    [
      "thermostat switched on but in mode off",
      DeviceType.Thermostat,
      { onoff_state: true, mode: "off" },
      { activity: "idle", runStatus: { run: "stopped", mode: "off" } },
    ],
  ])("%s", (_, type, attributes, expected) => {
    expect(status(type, attributes)).toEqual(expected);
  });

  it.each<[string, string, Record<string, unknown>, FleetStatus]>([
    // A mode with no on/off switch runs in that mode — every HVAC type reads
    // its own mode attribute into the run state, not only the thermostat.
    [
      "heat pump reporting a mode but no on/off switch",
      DeviceType.Awhp,
      { mode: "cool" },
      running("cool"),
    ],
    [
      "single-flux AHU reporting its hvac_mode but no on/off switch",
      DeviceType.AhuSingleFlux,
      { hvac_mode: "cool" },
      running("cool"),
    ],
    [
      "double-flux AHU reporting its hvac_mode but no on/off switch",
      DeviceType.AhuDoubleFlux,
      { hvac_mode: "heat" },
      running("heat"),
    ],
    // A unit that reports a valve is judged by its valves: its one battery
    // shut means it only ventilates, whatever hvac_mode it is set to.
    [
      "single-flux AHU whose only battery (heating) is shut",
      DeviceType.AhuSingleFlux,
      { onoff_state: true, hvac_mode: "heat", heating_valve: 0 },
      running(null),
    ],
    [
      "double-flux AHU whose only battery (cooling) is shut",
      DeviceType.AhuDoubleFlux,
      { onoff_state: true, hvac_mode: "cool", cooling_valve: 0 },
      running(null),
    ],
    // Both batteries open (reheat after dehumidifying): the heating one names
    // the mode even while the cooling valve is the wider open — coilMode
    // checks heating first.
    [
      "double-flux AHU with both batteries open",
      DeviceType.AhuDoubleFlux,
      { onoff_state: true, heating_valve: 15, cooling_valve: 80 },
      running("heat"),
    ],
  ])("%s", (_, type, attributes, expected) => {
    expect(status(type, attributes)).toEqual(expected);
  });

  it.each<[string, FleetStatus["activity"], string, Record<string, unknown>]>([
    // Zero is a reading, not a missing one: 0 W, a clear sky (WMO code 0)
    // and 0 °C are all reported.
    [
      "meter reporting zero power",
      "reporting",
      DeviceType.ElectricityMeter,
      { active_power: 0 },
    ],
    // The tile follows the reading the lead shows: a power the lead cannot
    // read (a string) leaves both empty.
    [
      "meter reporting its power as text",
      "unknown",
      DeviceType.ElectricityMeter,
      { active_power: "240" },
    ],
    [
      "weather sensor reporting a clear sky (code 0)",
      "reporting",
      DeviceType.WeatherSensor,
      { weather_code: 0 },
    ],
    [
      "weather sensor reporting 0 °C",
      "reporting",
      DeviceType.WeatherSensor,
      { temperature: 0 },
    ],
    // An extractor exposing neither flow switch nor on/off: its speed says
    // whether the fan turns.
    [
      "extractor exposing only its speed, turning",
      "running",
      DeviceType.AirExtractor,
      { fan_speed: 45 },
    ],
    [
      "extractor exposing only its speed, at rest",
      "idle",
      DeviceType.AirExtractor,
      { fan_speed: 0 },
    ],
  ])("%s: %s, no status line", (_, activity, type, attributes) => {
    expect(status(type, attributes)).toEqual({ activity, runStatus: null });
  });

  it.each<[string, FleetStatus["activity"], string, Record<string, unknown>]>([
    // Run-state types: their lead words the state, so no status line.
    ["extractor on", "running", DeviceType.AirExtractor, { onoff_state: true }],
    [
      "extractor commanded on but moving no air",
      "idle",
      DeviceType.AirExtractor,
      { onoff_state: true, flow_switch: false },
    ],
    ["extractor reporting nothing", "unknown", DeviceType.AirExtractor, {}],
    ["pump running", "running", DeviceType.Pump, { onoff_state: true }],
    ["pump stopped", "idle", DeviceType.Pump, { onoff_state: false }],
    ["pump reporting nothing", "unknown", DeviceType.Pump, {}],
    // Sensors: reporting — never running — while they have what they lead with.
    [
      "meter reporting its power",
      "reporting",
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
      "reporting",
      DeviceType.WeatherSensor,
      { weather_code: 63 },
    ],
    [
      "weather sensor reporting only its temperature",
      "reporting",
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
      "reporting",
      DeviceType.LiquidDetector,
      { liquid_detected: true },
    ],
    [
      "leak detector dry",
      "reporting",
      DeviceType.LiquidDetector,
      { liquid_detected: false },
    ],
    ["leak detector not reported", "unknown", DeviceType.LiquidDetector, {}],
    [
      "PMS monitor with a booking",
      "reporting",
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
