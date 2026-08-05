import { useMemo } from "react";
import { useDeviceSeries, useSeriesPoints } from "@/hooks/useDeviceTimeSeries";
import { holdLastRowUntil, mergeTimeSeries } from "@/lib/mergeTimeSeries";

/**
 * Last-`window` history of the given device metrics, merged onto a single
 * forward-filled timeline (the device-history pipeline) and held to now so
 * the final values span to the present.
 *
 * `recordedMetrics` lists which of the requested metrics the device actually
 * records — callers use it to distinguish "no data yet" from "not recorded".
 * `metrics` must be referentially stable (a module-level constant).
 */
export function useDeviceMetricsHistory(
  deviceId: string,
  metrics: readonly string[],
  window = "1d",
) {
  const { series, isLoading: seriesLoading } = useDeviceSeries(deviceId);

  const matchingSeries = useMemo(
    () => series.filter((s) => metrics.includes(s.metric)),
    [series, metrics],
  );

  const { pointsByMetric, isLoading: pointsLoading } = useSeriesPoints(
    matchingSeries,
    undefined,
    undefined,
    window,
  );

  const rows = useMemo(
    () =>
      holdLastRowUntil(
        mergeTimeSeries(pointsByMetric, [...metrics]),
        new Date(),
      ),
    [pointsByMetric, metrics],
  );

  const timestamps = useMemo(
    () => rows.map((r) => new Date(r.timestamp)),
    [rows],
  );

  const recordedMetrics = useMemo(
    () => new Set(matchingSeries.map((s) => s.metric)),
    [matchingSeries],
  );

  return {
    rows,
    timestamps,
    recordedMetrics,
    isLoading: seriesLoading || pointsLoading,
  };
}
