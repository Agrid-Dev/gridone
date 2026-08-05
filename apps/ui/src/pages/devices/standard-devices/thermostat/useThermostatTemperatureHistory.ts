import { useMemo } from "react";
import { useDeviceMetricsHistory } from "@/hooks/useDeviceMetricsHistory";

const METRICS = ["temperature", "temperature_setpoint"] as const;

/** Measured + setpoint temperature over the last 24 h, shaped for
 *  {@link TimeSeriesChart}: floats for the measured line, the setpoint as an
 *  int series so it renders as a step line on the shared axis. */
export function useThermostatTemperatureHistory(deviceId: string) {
  const { rows, timestamps, recordedMetrics, isLoading } =
    useDeviceMetricsHistory(deviceId, METRICS);

  const values = useMemo(
    () =>
      Object.fromEntries(
        METRICS.map((metric) => [
          metric,
          rows.map((r) => r.values[metric] as number | null),
        ]),
      ),
    [rows],
  );

  return {
    timestamps,
    values,
    isLoading,
    hasData: recordedMetrics.has("temperature") && rows.length > 0,
  };
}
