import type { Device } from "@gridone/sdk";
import { attributeUnit } from "@/lib/attributeUnits";
import { deviceAttributes } from "@/lib/devices";

/** View key → wire attribute name for every attribute an AHU synoptic can
 *  show (the union of the single- and double-flux standard schemas). Drafts
 *  and writes use the wire name. */
export const AHU_WIRE_NAMES = {
  supplyAirTemperature: "supply_air_temperature",
  supplyAirTemperatureSetpoint: "supply_air_temperature_setpoint",
  supplyFanSpeed: "supply_fan_speed",
  extractAirTemperature: "extract_air_temperature",
  extractFanSpeed: "extract_fan_speed",
  onoffState: "onoff_state",
  hvacMode: "hvac_mode",
  supplyAirPressure: "supply_air_pressure",
  supplyAirPressureSetpoint: "supply_air_pressure_setpoint",
  extractAirPressure: "extract_air_pressure",
  extractAirPressureSetpoint: "extract_air_pressure_setpoint",
  outdoorAirTemperature: "outdoor_air_temperature",
  exhaustAirTemperature: "exhaust_air_temperature",
  heatingValve: "heating_valve",
  coolingValve: "cooling_valve",
  exchangerUtilization: "exchanger_utilization",
} as const;

export type AhuAttributeKey = keyof typeof AHU_WIRE_NAMES;

/** Display unit per view key: the driver's when it declares one, else the
 *  app convention (`°`, `%`), else null — a pressure stays unitless rather
 *  than guessing Pa over bar. */
export type AhuUnits = Partial<Record<AhuAttributeKey, string | null>>;

export function readAhuUnits(device?: Device): AhuUnits {
  const attributes = device ? deviceAttributes(device) : {};
  const units: AhuUnits = {};
  for (const [key, wire] of Object.entries(AHU_WIRE_NAMES)) {
    units[key as AhuAttributeKey] = attributeUnit(wire, attributes[wire]);
  }
  return units;
}

/** The units by name convention alone — what a synoptic assumes when it is
 *  not handed a device's own. */
export const AHU_CONVENTION_UNITS: AhuUnits = readAhuUnits();
