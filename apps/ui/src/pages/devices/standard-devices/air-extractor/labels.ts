import { useTranslation } from "react-i18next";

/** Labels for the air extractor synoptic, under the `air_extractor.synoptic`
 *  locale namespace. */
export type AirExtractorLabelKey =
  | "extractAir"
  | "exhaustAir"
  | "fan"
  | "on"
  | "off"
  | "flowProven"
  | "flowMissing";

export function useAirExtractorLabel(): (key: AirExtractorLabelKey) => string {
  const { t } = useTranslation("standardDevices");
  return (key) => t(`air_extractor.synoptic.${key}`);
}
