import { useMemo } from "react";
import LineChart from "@/components/charts/LineChart";
import type { Series } from "@/components/charts/LineChart";
import { toLabel } from "@/lib/textFormat";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

export default function DeviceHistoryChart() {
  const { allRows, visibleAttributes, dataTypes } = useDeviceHistoryContext();

  const floatAttrs = useMemo(
    () => visibleAttributes.filter((attr) => dataTypes[attr] === "float"),
    [visibleAttributes, dataTypes],
  );

  const timestamps = useMemo(
    () => allRows.map((r) => new Date(r.timestamp)),
    [allRows],
  );

  const values = useMemo(
    () =>
      Object.fromEntries(
        floatAttrs.map((a) => [
          a,
          allRows.map((r) => r.values[a] as number | null),
        ]),
      ),
    [allRows, floatAttrs],
  );

  const series: Series[] = useMemo(
    () => floatAttrs.map((a) => ({ key: a, label: toLabel(a) })),
    [floatAttrs],
  );

  if (floatAttrs.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-center text-sm">
        No numeric attributes selected.
      </p>
    );
  }

  return (
    <LineChart
      timestamps={timestamps}
      series={series}
      values={values}
      height={400}
    />
  );
}
