import { useQueries } from "@tanstack/react-query";
import type { AggregationResultResponse, MeterTreeNode } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { collectMeterKeys, parseMeterKey, type MeterValues } from "./meterTree";

/** The reading of a counter over a bounded window is its `delta`: the index at
 *  the end minus the index carried in from before the start. */
const OPERATOR = "delta";

type Options = {
  start?: string;
  end?: string;
  last?: string;
  refetchInterval?: number | false;
};

/**
 * One consumption reading per meter in the tree, over the dashboard period.
 *
 * Fanned out as one query per *meter* rather than per node: `collectMeterKeys`
 * deduplicates, so a meter two nodes both point at is fetched once. Each is its
 * own query so a dead counter fails alone — one 404 must not blank the tree,
 * which is the whole point of the widget's `unknown` state.
 *
 * A query that fails resolves to `null`, the same as a counter with no
 * readings: from the widget's side both mean "this meter did not report".
 */
export function useMeterTreeValues(
  root: MeterTreeNode | undefined,
  { start, end, last, refetchInterval = false }: Options,
): { values: MeterValues; loading: boolean } {
  const client = useGridoneClient();
  const keys = root ? collectMeterKeys(root) : [];

  const results = useQueries({
    queries: keys.map((key) => {
      const { deviceId, attribute } = parseMeterKey(key);
      const params = { agg: OPERATOR, interval: "whole", start, end, last };
      return {
        queryKey: ["timeseries", "aggregate", deviceId, attribute, params],
        queryFn: () =>
          client.timeseries.aggregate(deviceId, attribute, {
            ...params,
            agg: OPERATOR,
          }),
        retry: false,
        refetchInterval,
      };
    }),
  });

  const values = new Map<string, number | null>();
  keys.forEach((key, index) => {
    const result = results[index];
    // `interval: "whole"` yields at most one bucket; no points at all means the
    // counter never reported over this window.
    const point = (result?.data as AggregationResultResponse | undefined)
      ?.points?.[0];
    const value = point?.value;
    values.set(key, typeof value === "number" ? value : null);
  });

  return { values, loading: results.some((r) => r.isLoading) };
}
