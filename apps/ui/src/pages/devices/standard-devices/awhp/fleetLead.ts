import { temperatureSpec } from "@/lib/deviceSummary";
import { setpointLead } from "../fleet-lead";
import type { FleetLeadOf } from "../types";

/** Water setpoint, then the outlet water temperature. */
export const awhpFleetLead: FleetLeadOf = (device, ctx) =>
  setpointLead(device, ctx, {
    setpoint: temperatureSpec("setpoint_temperature"),
    measureLabel: ctx.t("devices.card.lead.outlet"),
  });
