import { isAirExtractor, readAirExtractorAttributes } from "@/lib/devices";
import { deviceMeasureReading, formatReading } from "@/lib/deviceSummary";
import { EMPTY_LEAD, runStateLine } from "../fleet-lead";
import type { FleetLeadOf } from "../types";
import { extractorRunState } from "./fan";

/** Running or not, in words, then the fan speed while it runs. */
export const airExtractorFleetLead: FleetLeadOf = (device, ctx) => {
  if (!isAirExtractor(device)) return EMPTY_LEAD;
  const values = readAirExtractorAttributes(device);
  const state = extractorRunState(values);
  // The fan speed is the extractor's measure reading: its declared unit, or
  // the `%` convention.
  const speed = deviceMeasureReading(device);
  return {
    primary: runStateLine(state, ctx),
    secondary:
      state === "running" && speed?.value != null
        ? {
            value: formatReading(speed, ctx.locale),
            label: ctx.t("devices.card.lead.speed"),
          }
        : null,
  };
};
