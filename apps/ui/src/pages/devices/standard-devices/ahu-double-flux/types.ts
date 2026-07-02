/** Camel-cased view of the `ahu_double_flux` standard attribute schema
 *  (packages/devices_manager .../standard_schemas/registry/ahu_double_flux.py). */
export type AhuDoubleFluxValues = {
  supplyAirTemperature?: number | null;
  supplyAirTemperatureSetpoint?: number | null;
  supplyFanSpeed?: number | null;
  extractAirTemperature?: number | null;
  extractFanSpeed?: number | null;
  onoffState?: boolean | null;
  hvacMode?: string | null;
  supplyAirPressure?: number | null;
  supplyAirPressureSetpoint?: number | null;
  extractAirPressure?: number | null;
  extractAirPressureSetpoint?: number | null;
  outdoorAirTemperature?: number | null;
  exhaustAirTemperature?: number | null;
  heatingValve?: number | null;
  coolingValve?: number | null;
  exchangerUtilization?: number | null;
};

/** The writable targets of the AHU; editability is decided per device from
 *  the attribute's `readWriteModes`. */
export type AhuSetpointKey =
  | "supplyAirTemperatureSetpoint"
  | "supplyAirPressureSetpoint"
  | "extractAirPressureSetpoint";
