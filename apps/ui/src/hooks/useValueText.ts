import { useCallback } from "react";
import type { ValueLabel } from "@gridone/sdk";
import { useValueLabel } from "@/hooks/useValueLabel";
import { formatValue, type CellValue } from "@/lib/formatValue";

/** A value as a form or a review words it: a boolean through the driver's
 *  labels, anything else through {@link formatValue}. */
export function useValueText(): (
  value: CellValue,
  valueLabels?: ValueLabel[] | null,
  dataType?: string,
) => string {
  const labelFor = useValueLabel();
  return useCallback(
    (value: CellValue, valueLabels?: ValueLabel[] | null, dataType?: string) =>
      typeof value === "boolean"
        ? labelFor(value, valueLabels)
        : formatValue(value, dataType),
    [labelFor],
  );
}
