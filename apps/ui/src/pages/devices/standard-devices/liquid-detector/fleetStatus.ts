import { isLiquidDetector, readLiquidDetectorAttributes } from "@/lib/devices";
import { readingStatus, UNKNOWN_STATUS } from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";
import { liquidVerdict } from "./verdict";

/** Active once the probe has given a verdict, wet or dry. */
export const liquidDetectorFleetStatus: FleetStatusOf = (device) => {
  if (!isLiquidDetector(device)) return UNKNOWN_STATUS;
  return readingStatus(
    liquidVerdict(readLiquidDetectorAttributes(device)) != null,
  );
};
