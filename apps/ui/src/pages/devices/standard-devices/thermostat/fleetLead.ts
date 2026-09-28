import { setpointLead } from "../fleet-lead";
import type { FleetLeadOf } from "../types";

/** Setpoint, then the room temperature the thermostat measures. */
export const thermostatFleetLead: FleetLeadOf = (device, ctx) =>
  setpointLead(device, ctx, ctx.t("devices.card.lead.measured"));
