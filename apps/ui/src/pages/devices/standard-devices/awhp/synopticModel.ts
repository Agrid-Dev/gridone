/**
 * The air-to-water heat pump synoptic, as data: which sensor of the
 * drawing shows which standard attribute, which mode the drawing is in and
 * whether the unit runs. Pure; the geometry is `synopticLayout.ts` and the
 * drawing `AwhpSynoptic.tsx`.
 */
import type { AwhpAttributes } from "@/lib/devices";
import { cycleMedia } from "./cycleMedia";

/** A reversible unit heats or cools; the drawing knows no third state. */
export type SynopticMode = "heat" | "cool";

/** The sensors of the drawing: each one shows one attribute's reading. */
export const SENSOR_PIECES = [
  "suction_t",
  "suction_p",
  "discharge_t",
  "discharge_p",
  "air_p",
  "water_p",
  "outdoor_t",
  "inlet_t",
  "outlet_t",
] as const;
export type SensorPiece = (typeof SENSOR_PIECES)[number];

/** Attribute keys of the typed AWHP view that the sensors read. */
export type SensorAttribute = keyof Pick<
  AwhpAttributes,
  | "compressorSuctionTemperature"
  | "compressorSuctionPressure"
  | "compressorDischargeTemperature"
  | "compressorDischargePressure"
  | "condenserRefrigerantPressure"
  | "evaporatorRefrigerantPressure"
  | "outdoorTemperature"
  | "inletTemperature"
  | "outletTemperature"
>;

/** Wire names of the sensor attributes, for units and labels. */
export const SENSOR_WIRE_NAMES: Record<SensorAttribute, string> = {
  compressorSuctionTemperature: "compressor_suction_temperature",
  compressorSuctionPressure: "compressor_suction_pressure",
  compressorDischargeTemperature: "compressor_discharge_temperature",
  compressorDischargePressure: "compressor_discharge_pressure",
  condenserRefrigerantPressure: "condenser_refrigerant_pressure",
  evaporatorRefrigerantPressure: "evaporator_refrigerant_pressure",
  outdoorTemperature: "outdoor_temperature",
  inletTemperature: "inlet_temperature",
  outletTemperature: "outlet_temperature",
};

/** The mode the drawing shows: the plate exchanger condensing is heating,
 *  anything else is cooling, as `cycleMedia` reads the attribute. */
export function synopticMode(mode: string | null): SynopticMode {
  return cycleMedia(mode).condenser === "water" ? "heat" : "cool";
}

/**
 * Which attribute a sensor shows. The coil and plate pressure transducers
 * read whichever side of the cycle their exchanger plays in the current
 * mode: the condenser pressure when it condenses, the evaporator pressure
 * when it evaporates.
 */
export function sensorAttribute(
  piece: SensorPiece,
  mode: SynopticMode,
): SensorAttribute {
  switch (piece) {
    case "suction_t":
      return "compressorSuctionTemperature";
    case "suction_p":
      return "compressorSuctionPressure";
    case "discharge_t":
      return "compressorDischargeTemperature";
    case "discharge_p":
      return "compressorDischargePressure";
    case "air_p":
      return mode === "cool"
        ? "condenserRefrigerantPressure"
        : "evaporatorRefrigerantPressure";
    case "water_p":
      return mode === "heat"
        ? "condenserRefrigerantPressure"
        : "evaporatorRefrigerantPressure";
    case "outdoor_t":
      return "outdoorTemperature";
    case "inlet_t":
      return "inletTemperature";
    case "outlet_t":
      return "outletTemperature";
  }
}

/** Whether the compressor and fan turn: on, and not held in standby or
 *  alarm by the unit. */
export function isRunning(a: AwhpAttributes): boolean {
  const status = a.unitRunStatus?.toLowerCase() ?? "";
  return a.onoffState === true && status !== "standby" && status !== "alarm";
}
