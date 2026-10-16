import type { Device } from "@gridone/sdk";
import { deviceAttributes } from "@/lib/devices";
import { attributeUnit } from "@/lib/attributeUnits";
import { SENSOR_WIRE_NAMES, type SensorAttribute } from "./synopticModel";

/** Display unit per sensor attribute: the driver's when it declares one,
 *  else the app convention (`°` for a temperature), else null — a
 *  refrigerant pressure stays unitless rather than guessing bar over PSI. */
export type AwhpUnits = Partial<Record<SensorAttribute, string | null>>;

export function readAwhpUnits(device?: Device): AwhpUnits {
  const attributes = device ? deviceAttributes(device) : {};
  const units: AwhpUnits = {};
  for (const [key, wire] of Object.entries(SENSOR_WIRE_NAMES)) {
    units[key as SensorAttribute] = attributeUnit(wire, attributes[wire]);
  }
  return units;
}

/** The units by name convention alone — what the figure assumes when it is
 *  not handed a device's own. */
export const AWHP_CONVENTION_UNITS: AwhpUnits = readAwhpUnits();
