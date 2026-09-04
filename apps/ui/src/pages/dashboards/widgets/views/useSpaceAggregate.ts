import { useQuery } from "@tanstack/react-query";
import type { AggregationOperator, SpaceAggregationResult } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { devicesFilterToListParams } from "@/lib/devices";
import type { AttributeTarget } from "./useTargetDevices";

type UseSpaceAggregateOptions = {
  target: AttributeTarget;
  /** Per-device time aggregation, run before the space fold. */
  agg: AggregationOperator;
  spaceAgg: AggregationOperator;
  /** Bucket width, in the aggregate endpoints' vocabulary: `"auto"` lets the
   *  server cut the window into buckets, `"whole"` reduces it to one (a KPI's
   *  period reading), and a pinned width like `"1d"` says what a bucket means
   *  rather than how many there should be. */
  interval?: string;
  start?: string;
  end?: string;
  last?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
};

/**
 * One attribute folded over a device set into a single series.
 *
 * A single request replaces the per-device fan-out: the server resolves the
 * target, time-aggregates every device's series and folds each bucket with
 * `spaceAgg`.
 */
export function useSpaceAggregate({
  target,
  agg,
  spaceAgg,
  interval = "auto",
  start,
  end,
  last,
  enabled = true,
  refetchInterval = false,
}: UseSpaceAggregateOptions) {
  const client = useGridoneClient();

  const params = {
    ...devicesFilterToListParams(target.devices),
    attribute: target.attribute ?? "",
    agg,
    space_agg: spaceAgg,
    interval,
    start,
    end,
    last,
  };

  return useQuery<SpaceAggregationResult>({
    queryKey: ["timeseries", "space-aggregate", params],
    // No `group_by` here, so the SDK's overloads resolve to the flat shape.
    queryFn: () => client.timeseries.aggregateSpace(params),
    enabled: enabled && !!target.attribute,
    refetchInterval,
  });
}
