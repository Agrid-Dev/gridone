import { isAirExtractor, readAirExtractorAttributes } from "@/lib/devices";
import { attributeUnit } from "@/lib/attributeUnits";
import { AirExtractorSynoptic } from "./AirExtractorSynoptic";
import type { StandardControlProps } from "../types";

/** The extractor exposes no writable setpoints, so the control is a
 *  display-only synoptic (like the weather sensor / electricity meter). */
export function AirExtractorControl({ device }: StandardControlProps) {
  if (!isAirExtractor(device)) return null;
  return (
    <AirExtractorSynoptic
      values={readAirExtractorAttributes(device)}
      // An extractor's fan speed is a percentage; the name alone cannot say
      // so (a thermostat's is an enum), hence the fallback here.
      fanSpeedUnit={
        attributeUnit("fan_speed", device.attributes?.fan_speed) ?? "%"
      }
    />
  );
}
