import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  AggregateOptionsResponse,
  AggregationOperator,
  DataType,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** An operator as offered for one attribute: what it would yield, or `null`
 *  where the pair is refused. */
export type OperatorOption = {
  operator: AggregationOperator;
  /** Type the operator yields for this attribute; `null` when unsupported. */
  resultType: DataType | null;
};

/**
 * Every aggregation operator, and what each yields per data type.
 *
 * Asked without a time range: the intervals in the response depend on the
 * window, but the operator matrix does not, and this is only ever used to
 * populate an operator list. That makes it one cached answer for the whole
 * session rather than one per period.
 *
 * The matrix comes from the backend rather than being restated here, so an
 * operator added server-side — as `delta` was — appears without a UI change.
 */
export function useAggregateOptions() {
  const client = useGridoneClient();
  return useQuery<AggregateOptionsResponse>({
    queryKey: ["timeseries", "aggregate-options"],
    queryFn: () => client.timeseries.getAggregateOptions(),
    staleTime: Infinity,
  });
}

/**
 * Every operator as it applies to *dataType*, in the backend's order.
 *
 * The unsupported ones are kept, carrying a `null` result: an editor showing
 * only what fits leaves you unable to tell an operator that does not apply to
 * this attribute from one that does not exist.
 */
export function operatorsFor(
  options: AggregateOptionsResponse | undefined,
  dataType: DataType | undefined,
): OperatorOption[] {
  if (!options) return [];
  const matrix = options.operators_by_data_type;
  // Every data type is mapped against the same operators, so any row names the
  // full vocabulary — which is what to show before an attribute is chosen.
  const vocabulary = Object.values(matrix)[0];
  if (!vocabulary) return [];
  const forType = dataType ? matrix[dataType] : undefined;
  return Object.keys(vocabulary).map((operator) => ({
    operator: operator as AggregationOperator,
    resultType: forType ? (forType[operator] ?? null) : null,
  }));
}

/**
 * Clears a picked operator once the attribute's data type stops accepting it.
 *
 * Validity belongs to the data type, which the chosen operator can outlive:
 * the picker keeps an attribute of the same name when the device set changes,
 * and a saved widget's devices can be re-driven under it. So drop an operator
 * this type refuses whenever that becomes true, rather than only when the
 * attribute's name changes.
 */
export function useResetRefusedOperator<T>(
  operator: string | null | undefined,
  dataType: DataType | undefined,
  operators: OperatorOption[],
  onChange: (value: T) => void,
  resetValue: T,
): void {
  const refused =
    !!operator &&
    !!dataType &&
    operators.some((o) => o.operator === operator && o.resultType === null);

  useEffect(() => {
    if (refused) onChange(resetValue);
  }, [refused, onChange, resetValue]);
}
