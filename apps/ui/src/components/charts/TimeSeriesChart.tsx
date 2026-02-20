import { ParentSize } from "@visx/responsive";
import {
  AnimatedAxis,
  AnimatedGrid,
  AnimatedLineSeries,
  AnimatedAreaSeries,
  Tooltip,
  XYChart,
} from "@visx/xychart";
import { curveStepAfter } from "@visx/curve";

type FloatDatum = { timestamp: Date; value: number };
type BoolDatum = { timestamp: Date; value: number };

export type Series = {
  key: string;
  label: string;
};

export type TimeSeriesChartProps = {
  timestamps: Date[];
  /** Float series — rendered as lines, sharing a single y-axis (top panel) */
  lineSeries?: Series[];
  lineValues?: Record<string, (number | null)[]>;
  /** Boolean series — each rendered as a step-area in its own panel below */
  booleanSeries?: Series[];
  booleanValues?: Record<string, (boolean | null)[]>;
  height?: number;
};

const BOOL_PANEL_HEIGHT = 96;
const MARGIN = { top: 8, right: 16, bottom: 32, left: 48 };
const MARGIN_NO_BOTTOM = { ...MARGIN, bottom: 4 };

const floatAccessors = {
  xAccessor: (d: FloatDatum) => d.timestamp,
  yAccessor: (d: FloatDatum) => d.value,
};

const boolAccessors = {
  xAccessor: (d: BoolDatum) => d.timestamp,
  yAccessor: (d: BoolDatum) => d.value,
};

function TimeSeriesChartInner({
  timestamps,
  lineSeries = [],
  lineValues = {},
  booleanSeries = [],
  booleanValues = {},
  height = 300,
  width,
}: TimeSeriesChartProps & { width: number }) {
  if (width <= 0) return null;

  const hasFloats = lineSeries.length > 0;
  const hasBooleans = booleanSeries.length > 0;
  const totalBoolHeight = booleanSeries.length * BOOL_PANEL_HEIGHT;

  let floatHeight: number;
  if (hasFloats && hasBooleans) {
    floatHeight = Math.max(height - totalBoolHeight, 80);
  } else if (hasFloats) {
    floatHeight = height;
  } else {
    floatHeight = 0;
  }

  const boolPanelHeight = hasBooleans ? BOOL_PANEL_HEIGHT : 0;

  const isLastFloat = !hasBooleans;

  return (
    <div style={{ width }}>
      {/* Float panel */}
      {hasFloats && (
        <XYChart
          height={floatHeight}
          width={width}
          margin={isLastFloat ? MARGIN : MARGIN_NO_BOTTOM}
          xScale={{ type: "time" }}
          yScale={{ type: "linear" }}
        >
          {isLastFloat && <AnimatedAxis orientation="bottom" numTicks={5} />}
          <AnimatedAxis orientation="left" numTicks={5} />
          <AnimatedGrid columns={false} />
          {lineSeries.map((s) => {
            const data = timestamps
              .map((t, i) => ({ timestamp: t, value: lineValues[s.key]?.[i] }))
              .filter((d): d is FloatDatum => d.value !== null);
            return (
              <AnimatedLineSeries
                key={s.key}
                dataKey={s.key}
                data={data}
                {...floatAccessors}
              />
            );
          })}
          <Tooltip
            snapTooltipToDatumX
            showVerticalCrosshair
            renderTooltip={({ tooltipData }) => {
              const key = tooltipData?.nearestDatum?.key;
              const datum = tooltipData?.nearestDatum?.datum as
                | FloatDatum
                | undefined;
              if (!key || !datum) return null;
              const label = lineSeries.find((s) => s.key === key)?.label ?? key;
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
      )}

      {/* Boolean panels */}
      {booleanSeries.map((s, idx) => {
        const isLast = idx === booleanSeries.length - 1;
        const data = timestamps
          .map((t, i) => {
            const raw = booleanValues[s.key]?.[i];
            if (raw === null || raw === undefined) return null;
            return { timestamp: t, value: raw ? 1 : 0 };
          })
          .filter((d): d is BoolDatum => d !== null);

        return (
          <XYChart
            key={s.key}
            height={boolPanelHeight}
            width={width}
            margin={isLast ? MARGIN : MARGIN_NO_BOTTOM}
            xScale={{ type: "time" }}
            yScale={{ type: "linear", domain: [0, 1] }}
          >
            {isLast && <AnimatedAxis orientation="bottom" numTicks={5} />}
            <AnimatedAreaSeries
              dataKey={s.key}
              data={data}
              curve={curveStepAfter}
              renderLine={false}
              fillOpacity={0.3}
              {...boolAccessors}
            />
            {/* Series label on the left */}
            <text
              x={4}
              y={boolPanelHeight / 2}
              fontSize={11}
              fill="currentColor"
              dominantBaseline="middle"
              className="text-muted-foreground"
            >
              {s.label}
            </text>
          </XYChart>
        );
      })}
    </div>
  );
}

export default function TimeSeriesChart(props: TimeSeriesChartProps) {
  return (
    <ParentSize>
      {({ width }) => <TimeSeriesChartInner {...props} width={width} />}
    </ParentSize>
  );
}
