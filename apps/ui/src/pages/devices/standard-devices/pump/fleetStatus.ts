import { isPump, readPumpAttributes } from "@/lib/devices";
import { runOnlyStatus, UNKNOWN_STATUS } from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";
import { pumpState } from "./state";

/** Whether the pump runs — its lead already says so in words. */
export const pumpFleetStatus: FleetStatusOf = (device) => {
  if (!isPump(device)) return UNKNOWN_STATUS;
  return runOnlyStatus(pumpState(readPumpAttributes(device)));
};
