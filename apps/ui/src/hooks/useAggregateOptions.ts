import { useQuery } from "@tanstack/react-query";
import type { AggregateOptionsResponse, DataType } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/**
 * Which aggregation operators each data type admits.
 *
 * Asked without a time range: the intervals in the response depend on the
 * window, but the operator matrix does not, and this is only ever used to
 * populate an operator list. That makes it one cached answer for the whole
 * session rather than one per period.
 *
 * The list comes from the backend's compatibility matrix rather than being
 * restated here, so an operator added server-side (as `delta` was) appears
 * without a UI change, and one that would 422 is never offered.
 */
export function useAggregateOptions() {
  const client = useGridoneClient();
  return useQuery<AggregateOptionsResponse>({
    queryKey: ["timeseries", "aggregate-options"],
    queryFn: () => client.timeseries.getAggregateOptions(),
    staleTime: Infinity,
  });
}

/** Operators valid for *dataType*, or none when the type is unknown. */
export function operatorsFor(
  options: AggregateOptionsResponse | undefined,
  dataType: DataType | undefined,
): string[] {
  if (!options || !dataType) return [];
  return options.operators_by_data_type[dataType] ?? [];
}
