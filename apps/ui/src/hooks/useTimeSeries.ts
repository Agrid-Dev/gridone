import { useQuery } from "@tanstack/react-query";
import type {
  AggregationOperator,
  AggregationResultResponse,
  DataPoint,
  DataType,
  FetchPointsResultResponse,
  TimeSeries,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** Bucket width is asked for as `auto`: the API resolves it from the window it
 *  is given, and reports back which interval it chose. */
const AUTO_INTERVAL = "auto";

type UseTimeSeriesOptions = {
  deviceId: string;
  attributeName: string;
  start?: string;
  end?: string;
  /** Relative window (e.g. "3h"), the form a period preset resolves to. */
  last?: string;
  /** Reduce readings over time buckets; omit to read them raw. */
  agg?: AggregationOperator | null;
  enabled?: boolean;
  /** Poll cadence, or `false` to fetch once. Views showing a window that ends
   *  "now" pass an interval so an unattended screen stays current. */
  refetchInterval?: number | false;
};

type UseTimeSeriesResult = {
  series: TimeSeries | null;
  points: DataPoint[];
  /** Data type of the points returned, which aggregation can change: `count`
   *  yields ints whatever went in, and averaging a bool yields a float. Read
   *  this rather than `series.data_type` when deciding how to display them. */
  dataType: DataType | null;
  /** The bucket width `auto` resolved to, or null when reading raw. */
  interval: string | null;
  isLoading: boolean;
  error: Error | null;
};

/**
 * One attribute's history over a window, raw or aggregated.
 *
 * The two are different endpoints returning differently-shaped points, so the
 * choice is made here and callers see one shape either way. Aggregated buckets
 * are keyed by their start, which is the instant the bucket's value takes
 * effect — the same meaning a raw point's timestamp carries.
 */
export function useTimeSeries({
  deviceId,
  attributeName,
  start,
  end,
  last,
  agg = null,
  enabled = true,
  refetchInterval = false,
}: UseTimeSeriesOptions): UseTimeSeriesResult {
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
    queryKey: ["timeseries", "points", seriesId, start, end, last],
    queryFn: () =>
      client.timeseries.getPoints(deviceId, attributeName, {
        start,
        end,
        last,
        carry_forward: true,
      }),
    enabled: enabled && !!seriesId && !agg,
    refetchInterval,
  });

  const aggregateQuery = useQuery<AggregationResultResponse>({
    queryKey: ["timeseries", "aggregate", seriesId, start, end, last, agg],
    queryFn: () =>
      client.timeseries.aggregate(deviceId, attributeName, {
        start,
        end,
        last,
        agg: agg!,
        interval: AUTO_INTERVAL,
      }),
    enabled: enabled && !!seriesId && !!agg,
    refetchInterval,
  });

  const active = agg ? aggregateQuery : pointsQuery;

  const points: DataPoint[] = agg
    ? (aggregateQuery.data?.points ?? []).map((p) => ({
        timestamp: p.interval_start,
        value: p.value as DataPoint["value"],
      }))
    : ((pointsQuery.data?.points ?? []) as DataPoint[]);

  return {
    series: seriesQuery.data ?? null,
    points,
    dataType: agg
      ? (aggregateQuery.data?.aggregation_data_type ?? null)
      : (seriesQuery.data?.data_type ?? null),
    interval: agg ? (aggregateQuery.data?.interval ?? null) : null,
    isLoading: seriesQuery.isLoading || (!!seriesId && active.isLoading),
    error: seriesQuery.error ?? active.error ?? null,
  };
}
