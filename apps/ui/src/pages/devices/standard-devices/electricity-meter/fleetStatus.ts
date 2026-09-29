import { isElectricityMeter } from "@/lib/devices";
import { deviceMeasureReading } from "@/lib/deviceSummary";
import { readingStatus, UNKNOWN_STATUS } from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";

/** Active while it reports its power — the very reading its lead shows, so
 *  the tile never claims a value the lead has not got. */
export const electricityMeterFleetStatus: FleetStatusOf = (device) => {
  if (!isElectricityMeter(device)) return UNKNOWN_STATUS;
  return readingStatus(deviceMeasureReading(device)?.value != null);
};
