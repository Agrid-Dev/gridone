import { isAwhp, readAwhpAttributes } from "@/lib/devices";
import { hvacStatus, runState, UNKNOWN_STATUS } from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";

/** On/off and the mode the heat pump produces in. */
export const awhpFleetStatus: FleetStatusOf = (device) => {
  if (!isAwhp(device)) return UNKNOWN_STATUS;
  const { onoffState, mode } = readAwhpAttributes(device);
  return hvacStatus(runState(onoffState, mode), mode);
};
