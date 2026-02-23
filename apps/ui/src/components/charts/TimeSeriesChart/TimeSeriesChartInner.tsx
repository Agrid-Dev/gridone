import {
  AnimatedAxis,
  AnimatedGrid,
  AnimatedLineSeries,
  AnimatedAreaSeries,
  XYChart,
} from "@visx/xychart";
import { curveStepAfter } from "@visx/curve";

import type { BoolDatum, FloatDatum, TimeSeriesChartProps } from "./types";
import {
  DEFAULT_LINE_HEIGHT,
  DEFAULT_CATEGORICAL_HEIGHT,
  MARGIN,
  MARGIN_NO_BOTTOM,
  AXIS_EXTRA,
  CHART_COLORS,
  BOOL_COLOR,
  lineChartTheme,
  floatAccessors,
  boolAccessors,
  legendStyle,
  legendItemStyle,
  legendLabelStyle,
} from "./constants";
import { LegendSwatch } from "./LegendSwatch";
import { TooltipContent } from "./TooltipContent";
import { ScaleCapture } from "./ScaleCapture";
import { StringPanel } from "./StringPanel";
import { useChartTooltip } from "./useChartTooltip";

export function TimeSeriesChartInner({
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
  const {
    containerRef,
    floatPanelRef,
    floatYScaleRef,
    handlePointerMove,
    handlePointerLeave,
    cursorX,
    cursorY,
    hoveredIdx,
    tooltipRows,
    tooltipLeft,
    tooltipTop,
    hasFloats,
    hasStrings,
    isLastFloat,
  } = useChartTooltip({
    timestamps,
    width,
    lineSeries,
    lineValues,
    booleanSeries,
    booleanValues,
    stringSeries,
    stringValues,
    lineHeight,
    categoricalHeight,
  });

  if (width <= 0) return null;

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
            <AnimatedAxis orientation="left" />
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
