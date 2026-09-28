import { temperatureSpec } from "@/lib/deviceSummary";
import { setpointLead } from "../fleet-lead";
import type { FleetLeadOf } from "../types";

/** Setpoint, then the room temperature the thermostat measures. Fan mode
 *  does not regulate temperature, so its setpoint reads N/A whatever the
 *  device reports. */
export const thermostatFleetLead: FleetLeadOf = (device, ctx) =>
  setpointLead(device, ctx, {
    setpoint: temperatureSpec("temperature_setpoint"),
    measureLabel: ctx.t("devices.card.lead.measured"),
    inapplicable: device.attributes?.mode?.current_value === "fan",
  });
