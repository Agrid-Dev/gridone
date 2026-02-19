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

  const pointsByMetric: Record<string, DataPoint[]> = {};
  seriesList.forEach((series, i) => {
    pointsByMetric[series.metric] = pointsQueries[i]?.data ?? [];
  });

  return {
    series: seriesList,
    pointsByMetric,
    isLoading: seriesQuery.isLoading || isLoadingPoints,
    error:
      seriesQuery.error ?? pointsQueries.find((q) => q.error)?.error ?? null,
  };
}
