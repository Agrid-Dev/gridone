import {
  type MutableRefObject,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { ParentSize } from "@visx/responsive";
import {
  AnimatedAxis,
  AnimatedGrid,
  AnimatedLineSeries,
  AnimatedAreaSeries,
  DataContext,
  XYChart,
  lightTheme,
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
  /** Height of the float line panel */
  lineHeight?: number;
  /** Height of each boolean / string categorical panel */
  categoricalHeight?: number;
};

const DEFAULT_LINE_HEIGHT = 350;
const DEFAULT_CATEGORICAL_HEIGHT = 60;
const MARGIN = { top: 8, right: 16, bottom: 32, left: 48 };
const MARGIN_NO_BOTTOM = { ...MARGIN, bottom: 4 };
const AXIS_EXTRA = MARGIN.bottom - MARGIN_NO_BOTTOM.bottom;
const TOOLTIP_OFFSET = 12;

// Palette backed by CSS custom properties — follows light/dark theme.
const CHART_COLORS = Array.from(
  { length: 8 },
  (_, i) => `hsl(var(--chart-${i + 1}))`,
);

const BOOL_COLOR = CHART_COLORS[CHART_COLORS.length - 1];
const lineChartTheme = { ...lightTheme, colors: CHART_COLORS };

const floatAccessors = {
  xAccessor: (d: FloatDatum) => d.timestamp,
  yAccessor: (d: FloatDatum) => d.value,
};

const boolAccessors = {
  xAccessor: (d: BoolDatum) => d.timestamp,
  yAccessor: (d: BoolDatum) => d.value,
};

const legendStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "4px 16px",
  paddingLeft: MARGIN.left,
  paddingBottom: 0,
  paddingTop: 12,
};

const legendItemStyle = {
  display: "flex",
  alignItems: "center" as const,
  gap: 6,
  fontSize: 12,
};

const legendLabelStyle = {
  color: "hsl(var(--muted-foreground))",
};

type TooltipRow = {
  label: string;
  value: string;
  active?: boolean;
  swatch?: { color: string; variant: "line" | "area" };
};

function TooltipContent({
  timestamp,
  rows,
}: {
  timestamp: Date;
  rows: TooltipRow[];
}) {
  return (
    <div className="leading-relaxed">
      <div className="mb-1 text-xs font-normal">
        {timestamp.toLocaleString()}
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-center gap-1.5 rounded px-1 -mx-1 text-xs font-normal"
          style={
            r.active && r.swatch
              ? { backgroundColor: r.swatch.color.replace(/\)$/, " / 0.1)") }
              : undefined
          }
        >
          {r.swatch && (
            <LegendSwatch color={r.swatch.color} variant={r.swatch.variant} />
          )}
          <span className="text-muted-foreground">{r.label} </span>
          <span className="font-semibold">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function LegendSwatch({
  color,
  variant,
}: {
  color: string;
  variant: "line" | "area";
}) {
  return (
    <span
      style={{
        display: "inline-block",
        width: variant === "line" ? 16 : 10,
        height: variant === "line" ? 3 : 10,
        borderRadius: variant === "line" ? 1 : 2,
        backgroundColor: color,
        opacity: variant === "area" ? 0.5 : 1,
      }}
    />
  );
}

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

/** Find the index in `timestamps` nearest to the cursor pixel position. */
function nearestIndex(
  cursorX: number,
  width: number,
  timestamps: Date[],
): number | null {
  if (timestamps.length === 0) return null;
  if (timestamps.length === 1) return 0;
  const chartWidth = width - MARGIN.left - MARGIN.right;
  if (chartWidth <= 0) return null;
  const fraction = (cursorX - MARGIN.left) / chartWidth;
  const t0 = timestamps[0].getTime();
  const t1 = timestamps[timestamps.length - 1].getTime();
  const target = t0 + fraction * (t1 - t0);
  // Binary search for nearest
  let lo = 0;
  let hi = timestamps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid].getTime() < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) {
    const dPrev = Math.abs(timestamps[lo - 1].getTime() - target);
    const dCurr = Math.abs(timestamps[lo].getTime() - target);
    if (dPrev < dCurr) return lo - 1;
  }
  return lo;
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
    <>
      <div style={legendStyle}>
        {uniqueValues.map((val, vi) => (
          <div key={val} style={legendItemStyle}>
            <LegendSwatch
              color={CHART_COLORS[vi % CHART_COLORS.length]}
              variant="area"
            />
            <span style={legendLabelStyle}>
              {label}: {val}
            </span>
          </div>
        ))}
      </div>
      <XYChart
        height={panelHeight + (showBottomAxis ? AXIS_EXTRA : 0)}
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
      </XYChart>
    </>
  );
}

/** Renders nothing — just captures the live yScale from visx DataContext into a ref. */
function ScaleCapture({
  yScaleRef,
}: {
  yScaleRef: MutableRefObject<((v: number) => number) | null>;
}) {
  const { yScale } = useContext(DataContext);
  yScaleRef.current = yScale as ((v: number) => number) | null;
  return null;
}

function TimeSeriesChartInner({
  timestamps,
  lineSeries = [],
  lineValues = {},
  booleanSeries = [],
  booleanValues = {},
  stringSeries = [],
  stringValues = {},
  lineHeight = DEFAULT_LINE_HEIGHT,
  categoricalHeight = DEFAULT_CATEGORICAL_HEIGHT,
  width,
}: TimeSeriesChartProps & { width: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const floatPanelRef = useRef<HTMLDivElement>(null);
  const floatYScaleRef = useRef<((v: number) => number) | null>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [cursorY, setCursorY] = useState<number | null>(null);

  const chartLeft = MARGIN.left;
  const chartRight = width - MARGIN.right;

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= chartLeft && x <= chartRight) {
        setCursorX(x);
        setCursorY(y);
      } else {
        setCursorX(null);
        setCursorY(null);
      }
    },
    [chartLeft, chartRight],
  );

  const handlePointerLeave = useCallback(() => {
    setCursorX(null);
    setCursorY(null);
  }, []);

  // Build unified tooltip rows from the hovered index
  const hoveredIdx =
    cursorX !== null ? nearestIndex(cursorX, width, timestamps) : null;

  const hasFloats = lineSeries.length > 0;
  const hasBooleans = booleanSeries.length > 0;
  const hasStrings = stringSeries.length > 0;
  const isLastFloat = !hasBooleans && !hasStrings;

  // Build value→color maps for each string series (first-seen order)
  const stringColorMaps = useMemo(() => {
    const maps: Record<string, Map<string, string>> = {};
    for (const s of stringSeries) {
      const vals = stringValues[s.key] ?? [];
      const seen = new Map<string, string>();
      for (const v of vals) {
        if (v !== null && !seen.has(v)) {
          seen.set(v, CHART_COLORS[seen.size % CHART_COLORS.length]);
        }
      }
      maps[s.key] = seen;
    }
    return maps;
  }, [stringSeries, stringValues]);

  // floatYDomain kept for dependency tracking — actual scale comes from ScaleCapture
  const floatYDomain = useMemo(() => {
    for (const s of lineSeries) {
      const vals = lineValues[s.key];
      if (vals?.some((v) => v !== null)) return true;
    }
    return false;
  }, [lineSeries, lineValues]);

  // Determine which panel section the cursor is over to highlight its rows.
  // We accumulate heights top-down: legend rows (~26px each) + chart panels.
  const hoveredSection = useMemo(() => {
    if (cursorY === null) return null;
    let y = 0;
    const hasF = lineSeries.length > 0;
    const hasB = booleanSeries.length > 0;
    const hasS = stringSeries.length > 0;
    const isLastF = !hasB && !hasS;
    const legendH = 26; // approximate legend row height (12px font + 12px top pad + 2px)
    if (hasF) {
      y += legendH; // float legend
      const fh = lineHeight + (isLastF ? AXIS_EXTRA : 0);
      if (cursorY < y + fh) return "float";
      y += fh;
    }
    for (let i = 0; i < booleanSeries.length; i++) {
      y += legendH; // bool legend
      const isLast = !hasS && i === booleanSeries.length - 1;
      const bh = categoricalHeight + (isLast ? AXIS_EXTRA : 0);
      if (cursorY < y + bh) return booleanSeries[i].key;
      y += bh;
    }
    for (let i = 0; i < stringSeries.length; i++) {
      y += legendH; // string legend
      const isLast = i === stringSeries.length - 1;
      const sh = categoricalHeight + (isLast ? AXIS_EXTRA : 0);
      if (cursorY < y + sh) return stringSeries[i].key;
      y += sh;
    }
    return null;
  }, [
    cursorY,
    lineSeries,
    booleanSeries,
    stringSeries,
    lineHeight,
    categoricalHeight,
  ]);

  // When hovering the float panel, find the single nearest-by-Y series (within 32px).
  // Uses the actual visx yScale (captured via ScaleCapture) for pixel-perfect mapping.
  const nearestFloatKey = useMemo(() => {
    if (
      hoveredSection !== "float" ||
      hoveredIdx === null ||
      cursorY === null ||
      !floatYDomain
    )
      return null;
    const yScale = floatYScaleRef.current;
    const panelEl = floatPanelRef.current;
    const containerEl = containerRef.current;
    if (!yScale || !panelEl || !containerEl) return null;
    const panelTop =
      panelEl.getBoundingClientRect().top -
      containerEl.getBoundingClientRect().top;
    let nearestKey: string | null = null;
    let nearestDist = Infinity;
    for (const s of lineSeries) {
      const v = lineValues[s.key]?.[hoveredIdx];
      if (v === null || v === undefined) continue;
      // yScale maps data value → SVG pixel Y; add panelTop for container coords
      const seriesY = panelTop + yScale(v);
      const pxDist = Math.abs(cursorY - seriesY);
      if (pxDist < nearestDist) {
        nearestDist = pxDist;
        nearestKey = s.key;
      }
    }
    return nearestDist <= 32 ? nearestKey : null;
  }, [
    hoveredSection,
    hoveredIdx,
    cursorY,
    floatYDomain,
    lineSeries,
    lineValues,
  ]);

  const tooltipRows = useMemo(() => {
    if (hoveredIdx === null) return null;
    const rows: TooltipRow[] = [];
    for (let i = 0; i < lineSeries.length; i++) {
      const s = lineSeries[i];
      const v = lineValues[s.key]?.[hoveredIdx];
      rows.push({
        label: s.label,
        value: v !== null && v !== undefined ? v.toFixed(2) : "\u2014",
        active:
          hoveredSection === "float"
            ? nearestFloatKey === s.key
            : hoveredSection === null,
        swatch: {
          color: CHART_COLORS[i % CHART_COLORS.length],
          variant: "line",
        },
      });
    }
    for (const s of booleanSeries) {
      const v = booleanValues[s.key]?.[hoveredIdx];
      rows.push({
        label: s.label,
        value: v === true ? "true" : v === false ? "false" : "\u2014",
        active: hoveredSection === s.key || hoveredSection === null,
        swatch: { color: BOOL_COLOR, variant: "area" },
      });
    }
    for (const s of stringSeries) {
      const v = stringValues[s.key]?.[hoveredIdx];
      const color = v ? stringColorMaps[s.key]?.get(v) : undefined;
      rows.push({
        label: s.label,
        value: v ?? "\u2014",
        active: hoveredSection === s.key || hoveredSection === null,
        swatch: color ? { color, variant: "area" } : undefined,
      });
    }
    return rows;
  }, [
    hoveredIdx,
    hoveredSection,
    nearestFloatKey,
    lineSeries,
    lineValues,
    booleanSeries,
    booleanValues,
    stringSeries,
    stringValues,
    stringColorMaps,
  ]);

  if (width <= 0) return null;

  // Position tooltip: prefer right of cursor, flip left if near edge
  const tooltipLeft =
    cursorX !== null
      ? cursorX + TOOLTIP_OFFSET + 180 > width
        ? cursorX - TOOLTIP_OFFSET - 180
        : cursorX + TOOLTIP_OFFSET
      : 0;

  // Flip tooltip above cursor when near bottom
  const totalRows =
    lineSeries.length + booleanSeries.length + stringSeries.length;
  const tooltipEstH = 40 + 24 * totalRows;
  const containerH = containerRef.current?.offsetHeight ?? Infinity;
  const flipV =
    cursorY !== null && cursorY + TOOLTIP_OFFSET + tooltipEstH > containerH;
  const tooltipTop =
    cursorY !== null
      ? flipV
        ? cursorY - TOOLTIP_OFFSET - tooltipEstH
        : cursorY + TOOLTIP_OFFSET
      : 0;

  return (
    <div
      ref={containerRef}
      style={{ width, position: "relative" }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* Line chart legend */}
      {hasFloats && (
        <div style={legendStyle}>
          {lineSeries.map((s, i) => (
            <div key={s.key} style={legendItemStyle}>
              <LegendSwatch
                color={CHART_COLORS[i % CHART_COLORS.length]}
                variant="line"
              />
              <span style={legendLabelStyle}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Float panel */}
      {hasFloats && (
        <div ref={floatPanelRef}>
          <XYChart
            height={lineHeight + (isLastFloat ? AXIS_EXTRA : 0)}
            width={width}
            margin={isLastFloat ? MARGIN : MARGIN_NO_BOTTOM}
            xScale={{ type: "time" }}
            yScale={{ type: "linear" }}
            theme={lineChartTheme}
          >
            <ScaleCapture yScaleRef={floatYScaleRef} />
            {isLastFloat && <AnimatedAxis orientation="bottom" numTicks={5} />}
            <AnimatedAxis orientation="left" numTicks={5} />
            <AnimatedGrid columns={false} />
            {lineSeries.map((s) => {
              const data = timestamps
                .map((t, i) => ({
                  timestamp: t,
                  value: lineValues[s.key]?.[i],
                }))
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
          </XYChart>
        </div>
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
          <div key={s.key}>
            <div style={legendStyle}>
              <div style={legendItemStyle}>
                <LegendSwatch color={BOOL_COLOR} variant="area" />
                <span style={legendLabelStyle}>{s.label}</span>
              </div>
            </div>
            <XYChart
              height={categoricalHeight + (isLast ? AXIS_EXTRA : 0)}
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
                renderLine
                lineProps={{ strokeWidth: 1, stroke: BOOL_COLOR }}
                fillOpacity={0.3}
                fill={BOOL_COLOR}
                {...boolAccessors}
              />
            </XYChart>
          </div>
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
          panelHeight={categoricalHeight}
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

      {/* Unified tooltip */}
      {cursorX !== null &&
        cursorY !== null &&
        hoveredIdx !== null &&
        tooltipRows && (
          <div
            className="bg-popover text-popover-foreground rounded-md border px-3 py-2 shadow-md"
            style={{
              position: "absolute",
              left: tooltipLeft,
              top: tooltipTop,
              pointerEvents: "none",
              zIndex: 10,
              whiteSpace: "nowrap",
            }}
          >
            <TooltipContent
              timestamp={timestamps[hoveredIdx]}
              rows={tooltipRows}
            />
          </div>
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
