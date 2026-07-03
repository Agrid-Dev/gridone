import { useTranslation } from "react-i18next";

/** Labels shared by the AHU synoptics, under the `ahu.synoptic` locale
 *  namespace. Each variant uses the subset matching its layout. */
export type AhuSynopticLabelKey =
  | "freshAir"
  | "exhaustAir"
  | "extractAir"
  | "supplyAir"
  | "exchanger"
  | "filter"
  | "supplyFan"
  | "extractFan"
  | "heatingCoil"
  | "coolingCoil"
  | "on"
  | "off"
  | "setpoints"
  | "supplyAirTemperatureSetpoint"
  | "supplyAirPressureSetpoint"
  | "extractAirPressureSetpoint";

export function useAhuSynopticLabel(): (key: AhuSynopticLabelKey) => string {
  const { t } = useTranslation("standardDevices");
  return (key) => t(`ahu.synoptic.${key}`);
}
