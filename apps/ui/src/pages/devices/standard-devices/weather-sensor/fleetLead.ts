import { isWeatherSensor, readWeatherSensorAttributes } from "@/lib/devices";
import { measureLead } from "../fleet-lead";
import type { FleetLeadOf } from "../types";
import { getWeatherCode } from "./weatherCodes";

/** Outdoor temperature, then the sky in words. */
export const weatherSensorFleetLead: FleetLeadOf = (device, ctx) => {
  const lead = measureLead(device, ctx);
  if (!isWeatherSensor(device)) return lead;
  const code = readWeatherSensorAttributes(device).weatherCode;
  if (code == null) return lead;
  const { labelKey } = getWeatherCode(code);
  return {
    ...lead,
    secondary: {
      value: ctx.t(
        `controls.weatherCodes.${labelKey}` as "controls.weatherCodes.clearSky",
      ),
    },
  };
};
