import { useQuery } from "@tanstack/react-query";
import {
  listSeries,
  getSeriesPoints,
  type DataPoint,
  type DataType,
  type TimeSeries,
} from "../api/timeseries";

type UseTimeSeriesOptions = {
  deviceId: string;
  attributeName: string;
  start?: string;
  end?: string;
  enabled?: boolean;
};

export function useTimeSeries<D extends DataType = DataType>({
  deviceId,
  attributeName,
  start,
  end,
  enabled = true,
}: UseTimeSeriesOptions) {
  const seriesQuery = useQuery<TimeSeries<D> | null>({
    queryKey: ["timeseries", "series", deviceId, attributeName],
    queryFn: async () => {
      const results = await listSeries<D>(deviceId, attributeName);
      return results[0] ?? null;
    },
    enabled: enabled && !!deviceId && !!attributeName,
  });

  const seriesId = seriesQuery.data?.id;

  const pointsQuery = useQuery<DataPoint<D>[]>({
    queryKey: ["timeseries", "points", seriesId, start, end],
    queryFn: () =>
      getSeriesPoints<D>(seriesId!, { start, end, carryForward: true }),
    enabled: !!seriesId,
  });

  return {
    series: seriesQuery.data ?? null,
    points: pointsQuery.data ?? [],
    isLoading: seriesQuery.isLoading || (!!seriesId && pointsQuery.isLoading),
    error: seriesQuery.error ?? pointsQuery.error ?? null,
  };
}
