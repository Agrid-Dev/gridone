import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import type {
  DataPoint,
  FetchPointsResultResponse,
  TimeSeries,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export function useDeviceSeries(deviceId: string | undefined) {
  const client = useGridoneClient();

  const seriesQuery = useQuery<TimeSeries[]>({
    queryKey: ["timeseries", "series", deviceId],
    queryFn: () => client.timeseries.list(deviceId!),
    enabled: !!deviceId,
  });

  const series = useMemo(() => seriesQuery.data ?? [], [seriesQuery.data]);

  return {
    series,
    isLoading: seriesQuery.isLoading,
    error: seriesQuery.error ?? null,
  };
}

export function useSeriesPoints(
  seriesList: TimeSeries[],
  start?: string,
  end?: string,
  last?: string,
) {
  const client = useGridoneClient();

  const pointsQueries = useQueries({
    queries: seriesList.map((series) => ({
      queryKey: ["timeseries", "points", series.id, start, end, last],
      queryFn: (): Promise<FetchPointsResultResponse> =>
        client.timeseries.getPoints(series.owner_id, series.metric, {
          start,
          end,
          last,
          carry_forward: true,
        }),
    })),
  });

  const isLoading =
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
        result[series.metric] = pointsQueries[i]?.data?.points ?? [];
      });
      return result;
    },
    // pointsFingerprint is a stable scalar derived from the query timestamps;
    // it changes only when the underlying data actually updates.
    // seriesList must be memoized by the caller; pointsQueries is accessed via
    // closure and is always current when the memo recomputes.
    [seriesList, pointsFingerprint],
  );

  return {
    pointsByMetric,
    isLoading,
    error: pointsQueries.find((q) => q.error)?.error ?? null,
  };
}
