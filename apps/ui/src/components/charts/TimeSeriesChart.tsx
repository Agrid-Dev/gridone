import { useCallback, useMemo, useRef, useState } from "react";
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
  /** String series — each rendered as a color-coded step-area in its own panel */
  stringSeries?: Series[];
  stringValues?: Record<string, (string | null)[]>;
  height?: number;
};

const CATEGORICAL_PANEL_HEIGHT = 96;
const MARGIN = { top: 8, right: 16, bottom: 32, left: 48 };
const MARGIN_NO_BOTTOM = { ...MARGIN, bottom: 4 };

// Palette for distinct string values — backed by CSS custom properties
// so they follow light/dark theme automatically.
const CHART_COLORS = Array.from(
  { length: 8 },
  (_, i) => `hsl(var(--chart-${i + 1}))`,
);

const floatAccessors = {
  xAccessor: (d: FloatDatum) => d.timestamp,
  yAccessor: (d: FloatDatum) => d.value,
};

const boolAccessors = {
  xAccessor: (d: BoolDatum) => d.timestamp,
  yAccessor: (d: BoolDatum) => d.value,
};

/** Extract unique non-null values from a string series, in first-seen order. */
function useUniqueValues(values: (string | null)[]): string[] {
  return useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const v of values) {
      if (v !== null && !seen.has(v)) {
        seen.add(v);
        result.push(v);
      }
    }
    return result;
  }, [values]);
}

/** One panel per string series — renders one AreaSeries per unique value. */
function StringPanel({
  seriesKey,
  label,
  timestamps,
  values,
  panelHeight,
  width,
  showBottomAxis,
}: {
  seriesKey: string;
  label: string;
  timestamps: Date[];
  values: (string | null)[];
  panelHeight: number;
  width: number;
  showBottomAxis: boolean;
}) {
  const uniqueValues = useUniqueValues(values);

  return (
    <XYChart
      height={panelHeight}
      width={width}
      margin={showBottomAxis ? MARGIN : MARGIN_NO_BOTTOM}
      xScale={{ type: "time" }}
      yScale={{ type: "linear", domain: [0, 1] }}
    >
      {showBottomAxis && <AnimatedAxis orientation="bottom" numTicks={5} />}
      {uniqueValues.map((val, vi) => {
        const data = timestamps
          .map((t, i) => {
            if (values[i] === null || values[i] === undefined) return null;
            return { timestamp: t, value: values[i] === val ? 1 : 0 };
          })
          .filter((d): d is BoolDatum => d !== null);

        const color = CHART_COLORS[vi % CHART_COLORS.length];

        return (
          <AnimatedAreaSeries
            key={`${seriesKey}::${val}`}
            dataKey={`${seriesKey}::${val}`}
            data={data}
            curve={curveStepAfter}
            renderLine={false}
            fillOpacity={0.35}
            fill={color}
            {...boolAccessors}
          />
        );
      })}
      <Tooltip
        snapTooltipToDatumX
        renderTooltip={({ tooltipData }) => {
          const datum = tooltipData?.nearestDatum?.datum as
            | BoolDatum
            | undefined;
          if (!datum) return null;
          // Find which sub-series is active (value === 1) at this point
          const activeKey = Object.entries(tooltipData?.datumByKey ?? {}).find(
            ([key, entry]) =>
              key.startsWith(`${seriesKey}::`) &&
              (entry.datum as BoolDatum).value === 1,
          )?.[0];
          const activeValue = activeKey?.split("::")?.[1] ?? "—";
          return (
            <div>
              <div>{datum.timestamp.toLocaleString()}</div>
              <div>
                {label}: {activeValue}
              </div>
            </div>
          );
        }}
      />
      {/* Series label on the left */}
      <text
        x={4}
        y={panelHeight / 2}
        fontSize={11}
        fill="currentColor"
        dominantBaseline="middle"
        className="text-muted-foreground"
      >
        {label}
      </text>
    </XYChart>
  );
}

function TimeSeriesChartInner({
  timestamps,
  lineSeries = [],
  lineValues = {},
  booleanSeries = [],
  booleanValues = {},
  stringSeries = [],
  stringValues = {},
  height = 300,
  width,
}: TimeSeriesChartProps & { width: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);

  const chartLeft = MARGIN.left;
  const chartRight = width - MARGIN.right;

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      if (x >= chartLeft && x <= chartRight) {
        setCursorX(x);
      } else {
        setCursorX(null);
      }
    },
    [chartLeft, chartRight],
  );

  const handlePointerLeave = useCallback(() => setCursorX(null), []);

  if (width <= 0) return null;

  const hasFloats = lineSeries.length > 0;
  const hasBooleans = booleanSeries.length > 0;
  const hasStrings = stringSeries.length > 0;
  const categoricalCount = booleanSeries.length + stringSeries.length;
  const totalCategoricalHeight = categoricalCount * CATEGORICAL_PANEL_HEIGHT;

  let floatHeight: number;
  if (hasFloats && (hasBooleans || hasStrings)) {
    floatHeight = Math.max(height - totalCategoricalHeight, 80);
  } else if (hasFloats) {
    floatHeight = height;
  } else {
    floatHeight = 0;
  }

  const catPanelHeight =
    categoricalCount > 0
      ? hasFloats
        ? CATEGORICAL_PANEL_HEIGHT
        : Math.floor(height / categoricalCount)
      : 0;

  const isLastFloat = !hasBooleans && !hasStrings;

  return (
    <div
      ref={containerRef}
      style={{ width, position: "relative" }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
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
        const isLast = !hasStrings && idx === booleanSeries.length - 1;
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
            height={catPanelHeight}
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
            <Tooltip
              snapTooltipToDatumX
              renderTooltip={({ tooltipData }) => {
                const datum = tooltipData?.nearestDatum?.datum as
                  | BoolDatum
                  | undefined;
                if (!datum) return null;
                return (
                  <div>
                    <div>{datum.timestamp.toLocaleString()}</div>
                    <div>
                      {s.label}: {datum.value === 1 ? "true" : "false"}
                    </div>
                  </div>
                );
              }}
            />
            {/* Series label on the left */}
            <text
              x={4}
              y={catPanelHeight / 2}
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

      {/* String panels */}
      {stringSeries.map((s, idx) => (
        <StringPanel
          key={s.key}
          seriesKey={s.key}
          label={s.label}
          timestamps={timestamps}
          values={stringValues[s.key] ?? []}
          panelHeight={catPanelHeight}
          width={width}
          showBottomAxis={idx === stringSeries.length - 1}
        />
      ))}

      {/* Shared vertical crosshair */}
      {cursorX !== null && (
        <div
          style={{
            position: "absolute",
            left: cursorX,
            top: 0,
            bottom: 0,
            width: 1,
            pointerEvents: "none",
            backgroundColor: "hsl(var(--foreground) / 0.2)",
          }}
        />
      )}
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
