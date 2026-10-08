/** Camel-cased view of the `ahu_single_flux` standard attribute schema
 *  (packages/devices_manager .../standard_schemas/registry/ahu_single_flux.py). */
export type AhuSingleFluxValues = {
  supplyAirTemperature?: number | null;
  supplyAirTemperatureSetpoint?: number | null;
  supplyFanSpeed?: number | null;
  onoffState?: boolean | null;
  hvacMode?: string | null;
  supplyAirTemperatureCoolingSetpoint?: number | null;
  outdoorAirTemperature?: number | null;
  supplyAirPressure?: number | null;
  supplyAirPressureSetpoint?: number | null;
  supplyAirFlow?: number | null;
  supplyAirFlowSetpoint?: number | null;
  supplyAirHumidity?: number | null;
  extractAirTemperature?: number | null;
  extractAirPressure?: number | null;
  extractFanSpeed?: number | null;
  supplyFlowSwitch?: boolean | null;
  extractFlowSwitch?: boolean | null;
  outdoorAirDamperOpen?: boolean | null;
  supplyAirDamperOpen?: boolean | null;
  supplyPrefilterClogged?: boolean | null;
  supplyFilterClogged?: boolean | null;
  supplyFilterDifferentialPressure?: number | null;
  heatingValve?: number | null;
  heatingWaterFlow?: number | null;
  heatingWaterSupplyTemperature?: number | null;
  heatingWaterReturnTemperature?: number | null;
  heatingPower?: number | null;
  heatingEnergy?: number | null;
  coolingValve?: number | null;
  coolingWaterFlow?: number | null;
  coolingWaterSupplyTemperature?: number | null;
  coolingWaterReturnTemperature?: number | null;
  coolingPower?: number | null;
  coolingEnergy?: number | null;
};

/** The writable targets of the single-flux AHU; editability is decided per
 *  device from the attribute's `readWriteModes`. */
export type AhuSingleFluxSetpointKey =
  | "supplyAirTemperatureSetpoint"
  | "supplyAirTemperatureCoolingSetpoint"
  | "supplyAirPressureSetpoint"
  | "supplyAirFlowSetpoint";
