import { useQuery } from "@tanstack/react-query";
import type {
  DataPoint,
  FetchPointsResultResponse,
  TimeSeries,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

type UseTimeSeriesOptions = {
  deviceId: string;
  attributeName: string;
  start?: string;
  end?: string;
  enabled?: boolean;
};

export function useTimeSeries({
  deviceId,
  attributeName,
  start,
  end,
  enabled = true,
}: UseTimeSeriesOptions) {
  const client = useGridoneClient();

  const seriesQuery = useQuery<TimeSeries | null>({
    queryKey: ["timeseries", "series", deviceId, attributeName],
    queryFn: async () => {
      const results = await client.timeseries.list(deviceId, {
        metric: attributeName,
      });
      return results[0] ?? null;
    },
    enabled: enabled && !!deviceId && !!attributeName,
  });

  const seriesId = seriesQuery.data?.id;

  const pointsQuery = useQuery<FetchPointsResultResponse>({
    queryKey: ["timeseries", "points", seriesId, start, end],
    queryFn: () =>
      client.timeseries.getPoints(deviceId, attributeName, {
        start,
        end,
        carry_forward: true,
      }),
    enabled: !!seriesId,
  });

  return {
    series: seriesQuery.data ?? null,
    points: (pointsQuery.data?.points ?? []) as DataPoint[],
    isLoading: seriesQuery.isLoading || (!!seriesId && pointsQuery.isLoading),
    error: seriesQuery.error ?? pointsQuery.error ?? null,
  };
}
