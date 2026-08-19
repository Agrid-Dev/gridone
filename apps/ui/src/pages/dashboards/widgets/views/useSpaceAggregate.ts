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
  /** `"auto"` follows the window into several buckets; `"whole"` reduces the
   *  whole period to one bucket (a KPI's period reading). */
  interval?: "auto" | "whole";
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
    queryFn: () => client.timeseries.aggregateSpace(params),
    enabled: enabled && !!target.attribute,
    refetchInterval,
  });
}
