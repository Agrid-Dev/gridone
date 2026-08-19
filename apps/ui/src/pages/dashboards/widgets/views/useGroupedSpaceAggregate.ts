import { useQuery } from "@tanstack/react-query";
import type {
  AggregationOperator,
  GroupedSpaceAggregationResult,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { devicesFilterToListParams } from "@/lib/devices";
import type { AttributeTarget } from "./useTargetDevices";

type UseGroupedSpaceAggregateOptions = {
  target: AttributeTarget;
  /** Tag key to bucket the device set by before folding. */
  groupBy: string;
  /** Per-device time aggregation, run before the space fold. */
  agg: AggregationOperator;
  spaceAgg: AggregationOperator;
  interval?: "auto" | "whole";
  start?: string;
  end?: string;
  last?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
};

/**
 * Group-by counterpart of `useSpaceAggregate`: one attribute folded per tag
 * value instead of across the whole device set — one series per group.
 */
export function useGroupedSpaceAggregate({
  target,
  groupBy,
  agg,
  spaceAgg,
  interval = "auto",
  start,
  end,
  last,
  enabled = true,
  refetchInterval = false,
}: UseGroupedSpaceAggregateOptions) {
  const client = useGridoneClient();

  const params = {
    ...devicesFilterToListParams(target.devices),
    attribute: target.attribute ?? "",
    agg,
    space_agg: spaceAgg,
    group_by: groupBy,
    interval,
    start,
    end,
    last,
  };

  return useQuery<GroupedSpaceAggregationResult>({
    queryKey: ["timeseries", "grouped-space-aggregate", params],
    // `group_by` is always set here, so the SDK's overloads resolve to the
    // grouped shape.
    queryFn: () => client.timeseries.aggregateSpace(params),
    enabled: enabled && !!target.attribute && !!groupBy,
    refetchInterval,
  });
}
