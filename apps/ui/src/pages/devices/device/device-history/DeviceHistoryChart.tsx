import { useMemo } from "react";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import type { Series } from "@/components/charts/TimeSeriesChart";
import { toLabel } from "@/lib/textFormat";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

export default function DeviceHistoryChart() {
  const { allRows, visibleAttributes, dataTypes } = useDeviceHistoryContext();

  const floatAttrs = useMemo(
    () => visibleAttributes.filter((attr) => dataTypes[attr] === "float"),
    [visibleAttributes, dataTypes],
  );

  const boolAttrs = useMemo(
    () => visibleAttributes.filter((attr) => dataTypes[attr] === "boolean"),
    [visibleAttributes, dataTypes],
  );

  const stringAttrs = useMemo(
    () => visibleAttributes.filter((attr) => dataTypes[attr] === "string"),
    [visibleAttributes, dataTypes],
  );

  const timestamps = useMemo(
    () => allRows.map((r) => new Date(r.timestamp)),
    [allRows],
  );

  const lineValues = useMemo(
    () =>
      Object.fromEntries(
        floatAttrs.map((a) => [
          a,
          allRows.map((r) => r.values[a] as number | null),
        ]),
      ),
    [allRows, floatAttrs],
  );

  const lineSeries: Series[] = useMemo(
    () => floatAttrs.map((a) => ({ key: a, label: toLabel(a) })),
    [floatAttrs],
  );

  const booleanValues = useMemo(
    () =>
      Object.fromEntries(
        boolAttrs.map((a) => [
          a,
          allRows.map((r) => r.values[a] as boolean | null),
        ]),
      ),
    [allRows, boolAttrs],
  );

  const booleanSeries: Series[] = useMemo(
    () => boolAttrs.map((a) => ({ key: a, label: toLabel(a) })),
    [boolAttrs],
  );

  const stringValues = useMemo(
    () =>
      Object.fromEntries(
        stringAttrs.map((a) => [
          a,
          allRows.map((r) => r.values[a] as string | null),
        ]),
      ),
    [allRows, stringAttrs],
  );

  const stringSeries: Series[] = useMemo(
    () => stringAttrs.map((a) => ({ key: a, label: toLabel(a) })),
    [stringAttrs],
  );

  if (
    floatAttrs.length === 0 &&
    boolAttrs.length === 0 &&
    stringAttrs.length === 0
  ) {
    return (
      <p className="text-muted-foreground p-4 text-center text-sm">
        No chartable attributes selected.
      </p>
    );
  }

  return (
    <TimeSeriesChart
      timestamps={timestamps}
      lineSeries={lineSeries}
      lineValues={lineValues}
      booleanSeries={booleanSeries}
      booleanValues={booleanValues}
      stringSeries={stringSeries}
      stringValues={stringValues}
      height={400}
    />
  );
}
