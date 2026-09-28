import {
  isElectricityMeter,
  readElectricityMeterAttributes,
} from "@/lib/devices";
import { attributeLine, measureLead } from "../fleet-lead";
import type { FleetLeadOf } from "../types";

/** Active power, then the energy the meter has counted (its index when it
 *  exposes no energy). */
export const electricityMeterFleetLead: FleetLeadOf = (device, ctx) => {
  const lead = measureLead(device, ctx, ctx.t("devices.card.lead.power"));
  if (!isElectricityMeter(device)) return lead;
  const { energy, index } = readElectricityMeterAttributes(device);
  return {
    ...lead,
    secondary:
      energy != null
        ? attributeLine(
            device,
            "energy",
            energy,
            ctx,
            ctx.t("devices.card.lead.energy"),
          )
        : attributeLine(
            device,
            "index",
            index,
            ctx,
            ctx.t("devices.card.lead.index"),
          ),
  };
};
