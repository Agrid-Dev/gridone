/** Camel-cased view of the `ahu_single_flux` standard attribute schema
 *  (packages/devices_manager .../standard_schemas/registry/ahu_single_flux.py). */
export type AhuSingleFluxValues = {
  supplyAirTemperature?: number | null;
  supplyAirTemperatureSetpoint?: number | null;
  supplyFanSpeed?: number | null;
  onoffState?: boolean | null;
  hvacMode?: string | null;
  supplyAirPressure?: number | null;
  supplyAirPressureSetpoint?: number | null;
  outdoorAirTemperature?: number | null;
  extractAirTemperature?: number | null;
  extractAirPressure?: number | null;
  extractFanSpeed?: number | null;
  heatingValve?: number | null;
  coolingValve?: number | null;
};

/** The writable targets of the single-flux AHU; editability is decided per
 *  device from the attribute's `readWriteModes`. */
export type AhuSingleFluxSetpointKey =
  | "supplyAirTemperatureSetpoint"
  | "supplyAirPressureSetpoint";
