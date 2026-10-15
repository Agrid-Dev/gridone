import {
  isElectricityMeter,
  readElectricityMeterAttributes,
} from "@/lib/devices";
import { attributeLine, measureLead } from "../fleet-lead";
import type { FleetLeadOf } from "../types";

/** Active power, then the index the meter has counted. */
export const electricityMeterFleetLead: FleetLeadOf = (device, ctx) => {
  const lead = measureLead(device, ctx, ctx.t("devices.card.lead.power"));
  if (!isElectricityMeter(device)) return lead;
  const { index } = readElectricityMeterAttributes(device);
  return {
    ...lead,
    secondary: attributeLine(
      device,
      "index",
      index,
      ctx,
      ctx.t("devices.card.lead.index"),
    ),
  };
};
