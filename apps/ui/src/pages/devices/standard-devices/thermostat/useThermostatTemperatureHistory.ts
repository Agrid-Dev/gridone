import { useMemo } from "react";
import { useDeviceSeries, useSeriesPoints } from "@/hooks/useDeviceTimeSeries";
import { holdLastRowUntil, mergeTimeSeries } from "@/lib/mergeTimeSeries";

const METRICS = ["temperature", "temperature_setpoint"] as const;
const WINDOW = "1d";

/** Measured + setpoint temperature over the last 24 h, merged onto a single
 *  forward-filled timeline (the device-history pipeline) and shaped for
 *  {@link TimeSeriesChart}: floats for the measured line, the setpoint as an
 *  int series so it renders as a step line on the shared axis. */
export function useThermostatTemperatureHistory(deviceId: string) {
  const { series, isLoading: seriesLoading } = useDeviceSeries(deviceId);

  const temperatureSeries = useMemo(
    () =>
      series.filter((s) => (METRICS as readonly string[]).includes(s.metric)),
    [series],
  );

  const { pointsByMetric, isLoading: pointsLoading } = useSeriesPoints(
    temperatureSeries,
    undefined,
    undefined,
    WINDOW,
  );

  const rows = useMemo(
    () =>
      holdLastRowUntil(
        mergeTimeSeries(pointsByMetric, [...METRICS]),
        new Date(),
      ),
    [pointsByMetric],
  );

  const timestamps = useMemo(
    () => rows.map((r) => new Date(r.timestamp)),
    [rows],
  );

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

  const hasTemperature = temperatureSeries.some(
    (s) => s.metric === "temperature",
  );

  return {
    timestamps,
    values,
    isLoading: seriesLoading || pointsLoading,
    hasData: hasTemperature && rows.length > 0,
  };
}
