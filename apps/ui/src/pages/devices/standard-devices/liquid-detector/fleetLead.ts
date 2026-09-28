import { isLiquidDetector, readLiquidDetectorAttributes } from "@/lib/devices";
import { EMPTY_LEAD } from "../fleet-lead";
import type { FleetLeadOf } from "../types";
import { LIQUID_VERDICT_TEXT_CLASS, liquidVerdict } from "./verdict";

/** The verdict in words — dry or liquid detected — in its own tone. */
export const liquidDetectorFleetLead: FleetLeadOf = (device, ctx) => {
  if (!isLiquidDetector(device)) return EMPTY_LEAD;
  const verdict = liquidVerdict(readLiquidDetectorAttributes(device));
  if (!verdict) return EMPTY_LEAD;
  return {
    primary: {
      value: ctx.t(`standardDevices:liquid_detector.${verdict}`),
      tone: LIQUID_VERDICT_TEXT_CLASS[verdict],
    },
  };
};
