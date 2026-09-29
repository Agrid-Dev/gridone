import { isWeatherSensor, readWeatherSensorAttributes } from "@/lib/devices";
import { deviceMeasureReading } from "@/lib/deviceSummary";
import { readingStatus, UNKNOWN_STATUS } from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";

/** Active while it reports its temperature or the sky — its two lead
 *  lines. */
export const weatherSensorFleetStatus: FleetStatusOf = (device) => {
  if (!isWeatherSensor(device)) return UNKNOWN_STATUS;
  return readingStatus(
    deviceMeasureReading(device)?.value != null ||
      readWeatherSensorAttributes(device).weatherCode != null,
  );
};
