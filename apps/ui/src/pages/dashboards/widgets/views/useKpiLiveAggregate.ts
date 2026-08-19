import { useQuery } from "@tanstack/react-query";
import type {
  AggregationOperator,
  LiveSpaceAggregateResponse,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { devicesFilterToListParams } from "@/lib/devices";
import type { AttributeTarget } from "./useTargetDevices";

type UseKpiLiveAggregateOptions = {
  target: AttributeTarget;
  spaceAgg: AggregationOperator;
  refetchInterval?: number | false;
};

/**
 * A device set's current values folded into one (KPI case C, "live"): a
 * single request replaces a per-device fan-out, the same way
 * `useSpaceAggregate` does for a time-aggregated series.
 */
export function useKpiLiveAggregate({
  target,
  spaceAgg,
  refetchInterval = false,
}: UseKpiLiveAggregateOptions) {
  const client = useGridoneClient();

  const params = {
    ...devicesFilterToListParams(target.devices),
    attribute: target.attribute ?? "",
    space_agg: spaceAgg,
  };

  return useQuery<LiveSpaceAggregateResponse>({
    queryKey: ["timeseries", "live-aggregate", params],
    // No `group_by` here, so the response is always the flat shape — the
    // union only widens for `useGroupedSpaceAggregate`'s counterpart call.
    queryFn: () =>
      client.timeseries.aggregateLive(
        params,
      ) as Promise<LiveSpaceAggregateResponse>,
    enabled: !!target.attribute,
    refetchInterval,
  });
}
