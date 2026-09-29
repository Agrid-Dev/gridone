import { isPmsMonitor, readPmsMonitorAttributes } from "@/lib/devices";
import { readingStatus, UNKNOWN_STATUS } from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";

/** Active once the PMS reports the room's reservation status. */
export const pmsMonitorFleetStatus: FleetStatusOf = (device) => {
  if (!isPmsMonitor(device)) return UNKNOWN_STATUS;
  return readingStatus(
    readPmsMonitorAttributes(device).reservationStatus != null,
  );
};
