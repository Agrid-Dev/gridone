import { useTranslation } from "react-i18next";

/** Labels shared by the AHU synoptics, under the `ahu.synoptic` locale
 *  namespace. Each variant uses the subset matching its layout. */
export type AhuSynopticLabelKey =
  | "freshAir"
  | "exhaustAir"
  | "extractAir"
  | "supplyAir"
  | "exchanger"
  | "efficiency"
  | "filter"
  | "prefilter"
  | "filterClean"
  | "filterClogged"
  | "damper"
  | "freshAirDamper"
  | "supplyDamper"
  | "damperOpen"
  | "damperClosed"
  | "airflow"
  | "flowProven"
  | "flowMissing"
  | "supplyFan"
  | "extractFan"
  | "heatingCoil"
  | "coolingCoil"
  | "heatingLoop"
  | "coolingLoop"
  | "heating"
  | "cooling"
  | "valve"
  | "waterFlow"
  | "power"
  | "supplyFanShort"
  | "extractFanShort"
  | "temperature"
  | "pressure"
  | "flow"
  | "humidity"
  | "co2"
  | "setpoint"
  | "on"
  | "off"
  | "supplyAirTemperatureSetpoint"
  | "supplyAirTemperatureCoolingSetpoint"
  | "supplyAirPressureSetpoint"
  | "extractAirPressureSetpoint"
  | "supplyAirFlowSetpoint"
  | "extractAirFlowSetpoint";

export function useAhuSynopticLabel(): (key: AhuSynopticLabelKey) => string {
  const { t } = useTranslation("standardDevices");
  return (key) => t(`ahu.synoptic.${key}`);
}
