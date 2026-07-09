import { isAirExtractor, readAirExtractorAttributes } from "@/lib/devices";
import { AirExtractorSynoptic } from "./AirExtractorSynoptic";
import type { StandardControlProps } from "../types";

/** The extractor exposes no writable setpoints, so the control is a
 *  display-only synoptic (like the weather sensor / electricity meter). */
export function AirExtractorControl({ device }: StandardControlProps) {
  if (!isAirExtractor(device)) return null;
  return <AirExtractorSynoptic values={readAirExtractorAttributes(device)} />;
}
