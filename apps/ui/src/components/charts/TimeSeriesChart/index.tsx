import { ParentSize } from "@visx/responsive";
import type { TimeSeriesChartProps } from "./types";
import { TimeSeriesChartInner } from "./TimeSeriesChartInner";

export type { Series, TimeSeriesChartProps } from "./types";

export default function TimeSeriesChart(props: TimeSeriesChartProps) {
  return (
    <ParentSize>
      {({ width }) => <TimeSeriesChartInner {...props} width={width} />}
    </ParentSize>
  );
}
