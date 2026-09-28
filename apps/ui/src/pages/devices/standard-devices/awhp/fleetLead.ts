import { setpointLead } from "../fleet-lead";
import type { FleetLeadOf } from "../types";

/** Water setpoint, then the outlet water temperature. */
export const awhpFleetLead: FleetLeadOf = (device, ctx) =>
  setpointLead(device, ctx, ctx.t("devices.card.lead.outlet"));
