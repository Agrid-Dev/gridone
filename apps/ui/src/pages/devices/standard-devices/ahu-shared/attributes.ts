import type { Device } from "@gridone/sdk";
import { attributeUnit } from "@/lib/attributeUnits";
import { deviceAttributes } from "@/lib/devices";

/** View key → wire attribute name for every attribute an AHU synoptic can
 *  show (the union of the single- and double-flux standard schemas). Drafts
 *  and writes use the wire name. */
export const AHU_WIRE_NAMES = {
  supplyAirTemperature: "supply_air_temperature",
  supplyAirTemperatureSetpoint: "supply_air_temperature_setpoint",
  supplyAirTemperatureCoolingSetpoint:
    "supply_air_temperature_cooling_setpoint",
  supplyFanSpeed: "supply_fan_speed",
  extractAirTemperature: "extract_air_temperature",
  extractFanSpeed: "extract_fan_speed",
  onoffState: "onoff_state",
  hvacMode: "hvac_mode",
  supplyAirPressure: "supply_air_pressure",
  supplyAirPressureSetpoint: "supply_air_pressure_setpoint",
  extractAirPressure: "extract_air_pressure",
  extractAirPressureSetpoint: "extract_air_pressure_setpoint",
  supplyAirFlow: "supply_air_flow",
  supplyAirFlowSetpoint: "supply_air_flow_setpoint",
  extractAirFlow: "extract_air_flow",
  extractAirFlowSetpoint: "extract_air_flow_setpoint",
  supplyAirHumidity: "supply_air_humidity",
  extractAirHumidity: "extract_air_humidity",
  extractAirCo2: "extract_air_co2",
  outdoorAirTemperature: "outdoor_air_temperature",
  exhaustAirTemperature: "exhaust_air_temperature",
  supplyFlowSwitch: "supply_flow_switch",
  extractFlowSwitch: "extract_flow_switch",
  outdoorAirDamperOpen: "outdoor_air_damper_open",
  supplyAirDamperOpen: "supply_air_damper_open",
  supplyPrefilterClogged: "supply_prefilter_clogged",
  supplyFilterClogged: "supply_filter_clogged",
  extractFilterClogged: "extract_filter_clogged",
  supplyFilterDifferentialPressure: "supply_filter_differential_pressure",
  extractFilterDifferentialPressure: "extract_filter_differential_pressure",
  heatingValve: "heating_valve",
  heatingWaterFlow: "heating_water_flow",
  heatingWaterSupplyTemperature: "heating_water_supply_temperature",
  heatingWaterReturnTemperature: "heating_water_return_temperature",
  heatingPower: "heating_power",
  heatingEnergy: "heating_energy",
  coolingValve: "cooling_valve",
  coolingWaterFlow: "cooling_water_flow",
  coolingWaterSupplyTemperature: "cooling_water_supply_temperature",
  coolingWaterReturnTemperature: "cooling_water_return_temperature",
  coolingPower: "cooling_power",
  coolingEnergy: "cooling_energy",
  exchangerUtilization: "exchanger_utilization",
  exchangerEfficiency: "exchanger_efficiency",
} as const;

export type AhuAttributeKey = keyof typeof AHU_WIRE_NAMES;

/** The boolean states of an AHU: run state, flow switches, damper limit
 *  switches and filter states. Everything else is numeric or the mode. */
export type AhuStateKey =
  | "onoffState"
  | "supplyFlowSwitch"
  | "extractFlowSwitch"
  | "outdoorAirDamperOpen"
  | "supplyAirDamperOpen"
  | "supplyPrefilterClogged"
  | "supplyFilterClogged"
  | "extractFilterClogged";

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
