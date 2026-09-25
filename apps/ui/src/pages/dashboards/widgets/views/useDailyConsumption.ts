import { useQuery } from "@tanstack/react-query";
import type { DataPoint } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

type Options = {
  start?: string;
  end?: string;
  last?: string;
  refetchInterval?: number | false;
};

/**
 * One meter's consumption per day over the dashboard period: its index reduced
 * with `delta` in daily buckets, calibrated by the node's `scale` so the bars
 * add up to the figure the tree shows for it.
 *
 * Empty buckets are kept as `null`: bars need every bucket to size themselves
 * and to leave a day with no reading visibly blank.
 *
 * Disabled for an unbounded period, which cannot be cut into buckets.
 */
export function useDailyConsumption(
  deviceId: string,
  attribute: string,
  scale: number,
  { start, end, last, refetchInterval = false }: Options,
) {
  const client = useGridoneClient();
  const params = { agg: "delta", interval: "1d", start, end, last } as const;
  const unbounded = !start && !last;

  const query = useQuery({
    queryKey: ["timeseries", "aggregate", deviceId, attribute, params],
    queryFn: () => client.timeseries.aggregate(deviceId, attribute, params),
    enabled: !unbounded,
    retry: false,
    refetchInterval,
  });

  const points: DataPoint[] | undefined = query.data?.points.map((point) => ({
    timestamp: point.interval_start,
    // Null passes through as the chart's empty bucket, as the chart widget's
    // own bar views do.
    value: (typeof point.value === "number"
      ? point.value * scale
      : null) as DataPoint["value"],
  }));

  return {
    points,
    unbounded,
    isLoading: query.isLoading,
    error: query.error,
  };
}
