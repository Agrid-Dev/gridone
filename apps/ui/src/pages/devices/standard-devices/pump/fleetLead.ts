import { isPump, readPumpAttributes } from "@/lib/devices";
import { EMPTY_LEAD, runStateLine } from "../fleet-lead";
import type { FleetLeadOf } from "../types";
import { PUMP_STATE_TEXT_CLASS, pumpState } from "./state";

/** Running or not, in words — and no reading. A pump's quantities (head,
 *  flow, speed, power) share no unit, so a bare figure could mean any of
 *  four things. */
export const pumpFleetLead: FleetLeadOf = (device, ctx) => {
  if (!isPump(device)) return EMPTY_LEAD;
  return {
    primary: runStateLine(
      pumpState(readPumpAttributes(device)),
      ctx,
      PUMP_STATE_TEXT_CLASS.running,
    ),
  };
};
