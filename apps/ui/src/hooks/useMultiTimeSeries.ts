import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type {
  AggregationOperator,
  DataPoint,
  DataType,
  TimeSeries,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** Bucket width is asked for as `auto`: the API resolves it from the window it
 *  is given, and reports back which interval it chose. */
const AUTO_INTERVAL = "auto";

type UseMultiTimeSeriesOptions = {
  /** The devices whose series are read — one result per id, in order. */
  deviceIds: string[];
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

export type DeviceTimeSeries = {
  deviceId: string;
  /** The attribute's series on this device, or null when none is recorded. */
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

type UseMultiTimeSeriesResult = {
  /** One entry per requested device, in the order the ids were given. */
  results: DeviceTimeSeries[];
  isLoading: boolean;
};

/** What one device's window read resolves to, whichever endpoint served it. */
type WindowRead = {
  points: DataPoint[];
  /** Only aggregation reports these; raw reads take them from the series. */
  aggDataType: DataType | null;
  interval: string | null;
};

/**
 * One attribute's history over a window for a set of devices, raw or
 * aggregated.
 *
 * Each device follows the same two-step read as a single-series view: find the
 * attribute's series, then fetch its points — raw and aggregated are different
 * endpoints returning differently-shaped points, so the choice is made here
 * and callers see one shape either way. Aggregated buckets are keyed by their
 * start, which is the instant the bucket's value takes effect — the same
 * meaning a raw point's timestamp carries.
 *
 * Fetches fan out per device and fail independently: one device erroring
 * surfaces on its own entry, not on its neighbours'.
 */
export function useMultiTimeSeries({
  deviceIds,
  attributeName,
  start,
  end,
  last,
  agg = null,
  enabled = true,
  refetchInterval = false,
}: UseMultiTimeSeriesOptions): UseMultiTimeSeriesResult {
  const client = useGridoneClient();

  const seriesQueries = useQueries({
    queries: deviceIds.map((deviceId) => ({
      queryKey: ["timeseries", "series", deviceId, attributeName],
      queryFn: async (): Promise<TimeSeries | null> => {
        const results = await client.timeseries.list(deviceId, {
          metric: attributeName,
        });
        return results[0] ?? null;
      },
      enabled: enabled && !!deviceId && !!attributeName,
    })),
  });

  const pointsQueries = useQueries({
    queries: deviceIds.map((deviceId, i) => {
      const seriesId = seriesQueries[i]?.data?.id;
      return {
        queryKey: agg
          ? ["timeseries", "aggregate", seriesId, start, end, last, agg]
          : ["timeseries", "points", seriesId, start, end, last],
        queryFn: async (): Promise<WindowRead> => {
          if (agg) {
            const result = await client.timeseries.aggregate(
              deviceId,
              attributeName,
              { start, end, last, agg, interval: AUTO_INTERVAL },
            );
            return {
              points: result.points.map((p) => ({
                timestamp: p.interval_start,
                value: p.value as DataPoint["value"],
              })),
              aggDataType: result.aggregation_data_type ?? null,
              interval: result.interval ?? null,
            };
          }
          const result = await client.timeseries.getPoints(
            deviceId,
            attributeName,
            { start, end, last, carry_forward: true },
          );
          return {
            points: (result.points ?? []) as DataPoint[],
            aggDataType: null,
            interval: null,
          };
        },
        enabled: enabled && !!seriesId,
        refetchInterval,
      };
    }),
  });

  // useQueries returns a new array every render, but each entry's data ref is
  // stable (React Query guarantee). A scalar fingerprint over the queries'
  // state keys the memo, so `results` keeps its identity between renders and
  // only changes when a fetch actually progresses — consumers memoize chart
  // projections against it.
  const fingerprint = [...seriesQueries, ...pointsQueries]
    .map((q) => `${q.status}:${q.dataUpdatedAt}:${q.errorUpdatedAt}`)
    .join(",");

  const results = useMemo(
    () =>
      deviceIds.map((deviceId, i): DeviceTimeSeries => {
        const seriesQuery = seriesQueries[i];
        const pointsQuery = pointsQueries[i];
        const series = seriesQuery?.data ?? null;
        const read = pointsQuery?.data;
        return {
          deviceId,
          series,
          points: read?.points ?? [],
          dataType: agg
            ? (read?.aggDataType ?? null)
            : (series?.data_type ?? null),
          interval: read?.interval ?? null,
          isLoading:
            (seriesQuery?.isLoading ?? false) ||
            (!!series && (pointsQuery?.isLoading ?? false)),
          error: seriesQuery?.error ?? pointsQuery?.error ?? null,
        };
      }),
    // The fingerprint is a stable scalar derived from the queries' state; the
    // query arrays are accessed via closure and are always current when the
    // memo recomputes.
    [deviceIds, agg, fingerprint],
  );

  return {
    results,
    isLoading: results.some((r) => r.isLoading),
  };
}
