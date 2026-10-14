import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import {
  DeviceType,
  readAhuDoubleFluxAttributes,
  readAhuSingleFluxAttributes,
  readAirExtractorAttributes,
  readAwhpAttributes,
  readElectricityMeterAttributes,
  readLiquidDetectorAttributes,
  readPmsMonitorAttributes,
  readPumpAttributes,
  readThermostatAttributes,
  readWeatherSensorAttributes,
} from "@/lib/devices";
import { deviceMeasureReading } from "@/lib/deviceSummary";
import { fleetCardStatus } from "../fleetCardStatus";
import { FLEET_ATTRIBUTES, FLEET_ATTRIBUTES_BY_TYPE } from "./fleetAttributes";
import {
  getFleetLead,
  getFleetStatus,
  getStandardDeviceEntry,
} from "./registry";
import type { FleetLeadContext } from "./types";

/**
 * The drift guard of the fleet list: a fleet card must say the same of a
 * device whether it holds the whole device or what `GET /devices/` returns
 * for the fleet — the `FLEET_ATTRIBUTES` and the faults, each without its
 * write contract or texts. A card that starts reading anything else turns
 * this red, before it shows a dash on a real site.
 */

/** Each type's reader: every attribute its card could read, at most. */
const READERS = {
  [DeviceType.Thermostat]: readThermostatAttributes,
  [DeviceType.Awhp]: readAwhpAttributes,
  [DeviceType.WeatherSensor]: readWeatherSensorAttributes,
  [DeviceType.ElectricityMeter]: readElectricityMeterAttributes,
  [DeviceType.AhuDoubleFlux]: readAhuDoubleFluxAttributes,
  [DeviceType.AhuSingleFlux]: readAhuSingleFluxAttributes,
  [DeviceType.AirExtractor]: readAirExtractorAttributes,
  [DeviceType.PmsMonitor]: readPmsMonitorAttributes,
  [DeviceType.LiquidDetector]: readLiquidDetectorAttributes,
  [DeviceType.Pump]: readPumpAttributes,
} satisfies Record<DeviceType, (device: never) => unknown>;

/** The attribute names `type`'s reader looks up, recorded on a proxy. */
function namesRead(type: DeviceType): string[] {
  const names = new Set<string>();
  const attributes = new Proxy(
    {},
    {
      get: (_target, name) => {
        if (typeof name === "string") names.add(name);
        return undefined;
      },
    },
  );
  READERS[type]({ id: "probe", type, attributes } as never);
  return [...names];
}

type Values = Record<string, unknown>;

/** The states that make each fleet attribute matter to the card: a unit
 *  switched off with a mode still set, a fan proven still while commanded,
 *  a meter without energy falling back to its index... */
const SCENARIOS: Record<DeviceType, Values[]> = {
  [DeviceType.Thermostat]: [
    {
      temperature: 19.6,
      temperature_setpoint: 21,
      onoff_state: false,
      mode: "heat",
    },
    {
      temperature: 21.5,
      temperature_setpoint: 0,
      onoff_state: true,
      mode: "fan",
    },
  ],
  [DeviceType.Awhp]: [
    {
      outlet_temperature: 7.2,
      setpoint_temperature: 7,
      onoff_state: false,
      mode: "cool",
    },
  ],
  [DeviceType.WeatherSensor]: [{ temperature: 12.3, weather_code: 3 }],
  [DeviceType.ElectricityMeter]: [
    { active_power: 1250, energy: 3400, index: 99 },
    { active_power: 800, energy: null, index: 4321 },
  ],
  [DeviceType.AhuDoubleFlux]: ahuScenarios(),
  [DeviceType.AhuSingleFlux]: ahuScenarios(),
  [DeviceType.AirExtractor]: [
    { fan_speed: 60, onoff_state: true, flow_switch: true },
    { fan_speed: 45, onoff_state: false, flow_switch: null },
    { fan_speed: 60, onoff_state: true, flow_switch: false },
  ],
  [DeviceType.PmsMonitor]: [
    {
      reservation_status: "checked_in",
      guest_count: 2,
      next_arrival_at: "2026-10-20T15:00:00Z",
    },
    {
      reservation_status: "booked",
      guest_count: 0,
      next_arrival_at: "2026-10-20T15:00:00Z",
    },
  ],
  [DeviceType.LiquidDetector]: [{ liquid_detected: true }],
  [DeviceType.Pump]: [{ onoff_state: true }],
};

function ahuScenarios(): Values[] {
  return [
    {
      supply_air_temperature: 19.2,
      supply_air_temperature_setpoint: 18,
      onoff_state: true,
      hvac_mode: "cool",
      heating_valve: 35,
      cooling_valve: 0,
    },
    {
      supply_air_temperature: 16,
      supply_air_temperature_setpoint: 17,
      onoff_state: null,
      hvac_mode: "off",
      heating_valve: null,
      cooling_valve: null,
    },
    {
      supply_air_temperature: 14,
      supply_air_temperature_setpoint: 13,
      onoff_state: true,
      hvac_mode: "heat",
      heating_valve: 0,
      cooling_valve: 40,
    },
    {
      supply_air_temperature: 15,
      supply_air_temperature_setpoint: 19,
      onoff_state: false,
      hvac_mode: "heat",
      heating_valve: 0,
      cooling_valve: 0,
    },
  ];
}

/** What the reader reads beyond the scenario, and the attributes no card
 *  reads, take a value too — a few shapes, so a new dependency shows. */
const FILLERS: unknown[] = [7, true, "on"];

const OMITTED = [
  "write_constraints",
  "write_state",
  "description",
  "user_confirmation",
  "default_value",
] as const;

/** One attribute as the full `GET /devices/` serves it. */
function attribute(name: string, value: unknown, extra: Values = {}) {
  return {
    name,
    kind: "standard",
    current_value: value,
    last_updated: "2026-10-14T08:00:00Z",
    last_changed: "2026-10-14T07:00:00Z",
    label: { default: name, translations: {} },
    description: { default: `What ${name} is`, translations: {} },
    user_confirmation: { default: `Change ${name}?`, translations: {} },
    default_value: 0,
    write_constraints: { minimum: 0, maximum: 100 },
    write_state: { status: "ready", support: "supported", reasons: [] },
    ...extra,
  };
}

function fullDevice(type: DeviceType, values: Values, filler: unknown): Device {
  const read = Object.fromEntries(
    namesRead(type).map((name) => [name, attribute(name, filler)]),
  );
  const scenario = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      attribute(
        name,
        value,
        name.endsWith("temperature") ? { unit: "°C" } : {},
      ),
    ]),
  );
  return {
    id: "d1",
    name: "Device",
    type,
    tags: { asset_id: ["room-201"] },
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    is_faulty: true,
    attributes: {
      ...read,
      ...scenario,
      firmware_version: attribute("firmware_version", "4.2.1"),
      filter_hours: attribute("filter_hours", filler),
      connection_status: attribute("connection_status", "degraded", {
        kind: "internal",
      }),
      compressor_alarm: attribute("compressor_alarm", true, {
        kind: "fault",
        severity: "alert",
        healthy_values: [false],
        is_faulty: true,
      }),
      door_alarm: attribute("door_alarm", false, {
        kind: "fault",
        severity: "warning",
        healthy_values: [false],
        is_faulty: false,
      }),
    },
  } as unknown as Device;
}

/** `device` as a fleet list returns it: the selected attributes and every
 *  fault, each without its write contract or texts. */
function asListed(device: Device, names: ReadonlySet<string>): Device {
  const attributes = Object.entries(device.attributes ?? {})
    .filter(([name, attr]) => names.has(name) || attr.kind === "fault")
    .map(([name, attr]) => {
      const kept: Record<string, unknown> = { ...attr };
      for (const field of OMITTED) delete kept[field];
      return [name, kept];
    });
  return { ...device, attributes: Object.fromEntries(attributes) } as Device;
}

/** Keys and options, so leads are compared on what they would print. */
const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key) as FleetLeadContext["t"];
const ctx: FleetLeadContext = { t, locale: "fr" };

/** Everything a fleet card shows of a device. */
function card(device: Device) {
  return {
    status: getFleetStatus(device.type)(device),
    lead: getFleetLead(device.type)(device, ctx),
    measure: deviceMeasureReading(device),
    view: fleetCardStatus(device, true),
  };
}

const TYPES = Object.values(DeviceType);
const WIRE_SELECTION = new Set(FLEET_ATTRIBUTES);
const ownSelection = (type: DeviceType) =>
  new Set([...(FLEET_ATTRIBUTES_BY_TYPE[type] ?? []), "connection_status"]);

const cases = TYPES.flatMap((type) =>
  SCENARIOS[type].flatMap((values, scenario) =>
    FILLERS.map((filler) => ({
      type,
      label: `${type} #${scenario + 1}, filled with ${JSON.stringify(filler)}`,
      device: fullDevice(type, values, filler),
    })),
  ),
);

describe("fleet attributes", () => {
  it.each(TYPES.filter((type) => getStandardDeviceEntry(type)))(
    "lists what the %s fleet card reads",
    (type) => {
      expect(FLEET_ATTRIBUTES_BY_TYPE[type]?.length).toBeGreaterThan(0);
    },
  );

  it("fetches the union of the card attributes, sorted, and the connection", () => {
    expect(FLEET_ATTRIBUTES).toContain("connection_status");
    for (const names of Object.values(FLEET_ATTRIBUTES_BY_TYPE)) {
      expect(FLEET_ATTRIBUTES).toEqual(expect.arrayContaining([...names]));
    }
    expect(new Set(FLEET_ATTRIBUTES).size).toBe(FLEET_ATTRIBUTES.length);
    expect([...FLEET_ATTRIBUTES].sort()).toEqual(FLEET_ATTRIBUTES);
  });

  // Sanity of the fixtures: the card reads something, and the full device
  // carries attributes the fleet list leaves out.
  it("starts from devices the fleet list does trim", () => {
    for (const { device } of cases) {
      const listed = asListed(device, WIRE_SELECTION);
      expect(Object.keys(listed.attributes ?? {}).length).toBeLessThan(
        Object.keys(device.attributes ?? {}).length,
      );
    }
  });

  it.each(cases)(
    "shows the same card from the fleet list: $label",
    ({ device }) => {
      expect(card(asListed(device, WIRE_SELECTION))).toEqual(card(device));
    },
  );

  it.each(cases)(
    "needs nothing beyond its own type's list: $label",
    ({ type, device }) => {
      expect(card(asListed(device, ownSelection(type)))).toEqual(card(device));
    },
  );

  // The guard bites: every listed attribute changes some card when it goes
  // missing, so none is dead weight and the scenarios exercise each one.
  it.each(
    TYPES.flatMap((type) =>
      [...ownSelection(type)].map((name) => ({ type, name })),
    ),
  )("misses $name on a $type card when it is not fetched", ({ type, name }) => {
    const without = new Set(ownSelection(type));
    without.delete(name);
    const changed = cases
      .filter((c) => c.type === type)
      .some(
        ({ device }) =>
          JSON.stringify(card(asListed(device, without))) !==
          JSON.stringify(card(device)),
      );
    expect(changed).toBe(true);
  });
});
