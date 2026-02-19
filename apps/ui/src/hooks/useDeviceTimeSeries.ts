import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { listSeries, getSeriesPoints } from "../api/timeseries";
import type { DataPoint, TimeSeries } from "../api/timeseries";

export function useDeviceTimeSeries(deviceId: string | undefined) {
  const seriesQuery = useQuery<TimeSeries[]>({
    queryKey: ["timeseries", "series", deviceId],
    queryFn: () => listSeries(deviceId),
    enabled: !!deviceId,
  });

  const seriesList = seriesQuery.data ?? [];

  const pointsQueries = useQueries({
    queries: seriesList.map((series) => ({
      queryKey: ["timeseries", "points", series.id],
      queryFn: () => getSeriesPoints(series.id),
    })),
  });

  const isLoadingPoints =
    seriesList.length > 0 && pointsQueries.some((q) => q.isLoading);

  // Build a stable pointsByMetric object.
  // useQueries returns a new array every render, but each q.data ref is
  // stable (React Query guarantee). We derive a scalar fingerprint from
  // dataUpdatedAt so the memo only recomputes when data actually changes.
  const pointsFingerprint = pointsQueries.map((q) => q.dataUpdatedAt).join(",");

  const pointsByMetric = useMemo(
    () => {
      const result: Record<string, DataPoint[]> = {};
      seriesList.forEach((series, i) => {
        result[series.metric] = pointsQueries[i]?.data ?? [];
      });
      return result;
    },
    // pointsFingerprint is a stable scalar derived from the query timestamps;
    // it changes only when the underlying data actually updates.
    // seriesList is stable (React Query ref), pointsQueries is accessed via
    // closure and is always current when the memo recomputes.
    [seriesList, pointsFingerprint],
  );

  return {
    series: seriesList,
    pointsByMetric,
    isLoading: seriesQuery.isLoading || isLoadingPoints,
    error:
      seriesQuery.error ?? pointsQueries.find((q) => q.error)?.error ?? null,
  };
}
