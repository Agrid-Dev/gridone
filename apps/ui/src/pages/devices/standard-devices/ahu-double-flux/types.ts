import type { AhuSetpointKey as SharedSetpointKey } from "../ahu-shared";

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
  supplyAirTemperatureCoolingSetpoint?: number | null;
  outdoorAirTemperature?: number | null;
  exhaustAirTemperature?: number | null;
  supplyAirPressure?: number | null;
  supplyAirPressureSetpoint?: number | null;
  extractAirPressure?: number | null;
  extractAirPressureSetpoint?: number | null;
  supplyAirFlow?: number | null;
  supplyAirFlowSetpoint?: number | null;
  extractAirFlow?: number | null;
  extractAirFlowSetpoint?: number | null;
  supplyAirHumidity?: number | null;
  extractAirHumidity?: number | null;
  extractAirCo2?: number | null;
  supplyFlowSwitch?: boolean | null;
  extractFlowSwitch?: boolean | null;
  outdoorAirDamperOpen?: boolean | null;
  supplyAirDamperOpen?: boolean | null;
  supplyPrefilterClogged?: boolean | null;
  supplyFilterClogged?: boolean | null;
  extractFilterClogged?: boolean | null;
  supplyFilterDifferentialPressure?: number | null;
  extractFilterDifferentialPressure?: number | null;
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
  exchangerUtilization?: number | null;
  exchangerEfficiency?: number | null;
};

/** The writable targets of the AHU; editability is decided per device from
 *  the attribute's `readWriteModes`. */
export type AhuSetpointKey = SharedSetpointKey;
