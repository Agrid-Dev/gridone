import {
  isElectricityMeter,
  readElectricityMeterAttributes,
} from "@/lib/devices";
import { readingStatus, UNKNOWN_STATUS } from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";

/** Active while it reports its power, the reading it leads with. */
export const electricityMeterFleetStatus: FleetStatusOf = (device) => {
  if (!isElectricityMeter(device)) return UNKNOWN_STATUS;
  return readingStatus(
    readElectricityMeterAttributes(device).activePower != null,
  );
};
