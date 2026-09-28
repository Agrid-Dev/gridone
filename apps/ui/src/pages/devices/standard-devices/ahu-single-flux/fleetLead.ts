import { setpointLead } from "../fleet-lead";
import type { FleetLeadOf } from "../types";

/** Supply setpoint, then the supply air temperature. */
export const ahuSingleFluxFleetLead: FleetLeadOf = (device, ctx) =>
  setpointLead(device, ctx, ctx.t("devices.card.lead.supplyAir"));
