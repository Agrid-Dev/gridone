import { ParentSize } from "@visx/responsive";
import {
  AnimatedAxis,
  AnimatedGrid,
  AnimatedLineSeries,
  Tooltip,
  XYChart,
} from "@visx/xychart";

type Datum = { timestamp: Date; value: number };

export type Series = {
  key: string;
  label: string;
};

export type LineChartProps = {
  timestamps: Date[];
  series: Series[];
  values: Record<string, (number | null)[]>;
  height?: number;
};

const accessors = {
  xAccessor: (d: Datum) => d.timestamp,
  yAccessor: (d: Datum) => d.value,
};

function LineChartInner({
  timestamps,
  series,
  values,
  height = 300,
  width,
}: LineChartProps & { width: number }) {
  if (width <= 0) return null;

  return (
    <XYChart
      height={height}
      width={width}
      xScale={{ type: "time" }}
      yScale={{ type: "linear" }}
    >
      <AnimatedAxis orientation="bottom" numTicks={5} />
      <AnimatedAxis orientation="left" numTicks={5} />
      <AnimatedGrid columns={false} />
      {series.map((s) => {
        const data = timestamps
          .map((t, i) => ({ timestamp: t, value: values[s.key][i] }))
          .filter((d): d is Datum => d.value !== null);

        return (
          <AnimatedLineSeries
            key={s.key}
            dataKey={s.key}
            data={data}
            {...accessors}
          />
        );
      })}
      <Tooltip
        snapTooltipToDatumX
        showVerticalCrosshair
        renderTooltip={({ tooltipData }) => {
          const key = tooltipData?.nearestDatum?.key;
          const datum = tooltipData?.nearestDatum?.datum as Datum | undefined;
          if (!key || !datum) return null;
          const label = series.find((s) => s.key === key)?.label ?? key;
          return (
            <div>
              <div>{datum.timestamp.toLocaleString()}</div>
              <div>
                {label}: {datum.value}
              </div>
            </div>
          );
        }}
      />
    </XYChart>
  );
}

export default function LineChart(props: LineChartProps) {
  return (
    <ParentSize>
      {({ width }) => <LineChartInner {...props} width={width} />}
    </ParentSize>
  );
}
