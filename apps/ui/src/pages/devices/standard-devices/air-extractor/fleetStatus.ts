import { isAirExtractor, readAirExtractorAttributes } from "@/lib/devices";
import { runOnlyStatus, UNKNOWN_STATUS } from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";
import { extractorRunState } from "./fan";

/** Whether the fan turns — its lead already says so in words. */
export const airExtractorFleetStatus: FleetStatusOf = (device) => {
  if (!isAirExtractor(device)) return UNKNOWN_STATUS;
  return runOnlyStatus(extractorRunState(readAirExtractorAttributes(device)));
};
