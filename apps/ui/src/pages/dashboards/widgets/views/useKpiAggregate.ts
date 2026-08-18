import { useQuery } from "@tanstack/react-query";
import type {
  AggregationOperator,
  AggregationResultResponse,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

type UseKpiAggregateOptions = {
  deviceId: string | undefined;
  attribute: string;
  agg: AggregationOperator | undefined;
  start?: string;
  end?: string;
  last?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
};

/** One value reduced over the whole dashboard period (KPI case B): a single
 *  `interval="whole"` bucket, computed server-side. */
export function useKpiAggregate({
  deviceId,
  attribute,
  agg,
  start,
  end,
  last,
  enabled = true,
  refetchInterval = false,
}: UseKpiAggregateOptions) {
  const client = useGridoneClient();

  const params = { agg, interval: "whole", start, end, last };

  return useQuery<AggregationResultResponse>({
    queryKey: ["timeseries", "aggregate", deviceId, attribute, params],
    queryFn: () => {
      if (!deviceId || !agg) {
        throw new Error("deviceId and agg are required");
      }
      return client.timeseries.aggregate(deviceId, attribute, {
        ...params,
        agg,
      });
    },
    enabled: enabled && !!deviceId && !!agg,
    refetchInterval,
  });
}
