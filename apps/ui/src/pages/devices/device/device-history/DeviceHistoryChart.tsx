import { useMemo } from "react";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import type { Series } from "@/components/charts/TimeSeriesChart";
import { toLabel } from "@/lib/textFormat";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

export default function DeviceHistoryChart() {
  const { chartRows, visibleAttributes, dataTypes } = useDeviceHistoryContext();
  const { floatAttrs, intAttrs, boolAttrs, stringAttrs } = useMemo(() => {
    const floatAttrs = visibleAttributes.filter(
      (attr) => dataTypes[attr] === "float",
    );
    const intAttrs = visibleAttributes.filter(
      (attr) => dataTypes[attr] === "int",
    );
    const boolAttrs = visibleAttributes.filter(
      (attr) => dataTypes[attr] === "bool",
    );
    const stringAttrs = visibleAttributes.filter(
      (attr) => dataTypes[attr] === "str",
    );
    return { floatAttrs, intAttrs, boolAttrs, stringAttrs };
  }, [visibleAttributes, dataTypes]);

  const timestamps = useMemo(
    () => chartRows.map((r) => new Date(r.timestamp)),
    [chartRows],
  );

  const lineValues = useMemo(
    () =>
      Object.fromEntries(
        floatAttrs.map((a) => [
          a,
          chartRows.map((r) => r.values[a] as number | null),
        ]),
      ),
    [chartRows, floatAttrs],
  );

  const lineSeries: Series[] = useMemo(
    () => floatAttrs.map((a) => ({ key: a, label: toLabel(a) })),
    [floatAttrs],
  );

  const intValues = useMemo(
    () =>
      Object.fromEntries(
        intAttrs.map((a) => [
          a,
          chartRows.map((r) => r.values[a] as number | null),
        ]),
      ),
    [chartRows, intAttrs],
  );

  const intSeries: Series[] = useMemo(
    () => intAttrs.map((a) => ({ key: a, label: toLabel(a) })),
    [intAttrs],
  );

  const booleanValues = useMemo(
    () =>
      Object.fromEntries(
        boolAttrs.map((a) => [
          a,
          chartRows.map((r) => r.values[a] as boolean | null),
        ]),
      ),
    [chartRows, boolAttrs],
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
          chartRows.map((r) => r.values[a] as string | null),
        ]),
      ),
    [chartRows, stringAttrs],
  );

  const stringSeries: Series[] = useMemo(
    () => stringAttrs.map((a) => ({ key: a, label: toLabel(a) })),
    [stringAttrs],
  );

  if (
    floatAttrs.length === 0 &&
    intAttrs.length === 0 &&
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
      intSeries={intSeries}
      intValues={intValues}
      booleanSeries={booleanSeries}
      booleanValues={booleanValues}
      stringSeries={stringSeries}
      stringValues={stringValues}
    />
  );
}
