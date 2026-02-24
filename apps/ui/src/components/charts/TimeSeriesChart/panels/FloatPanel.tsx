import { useContext } from "react";
import {
  AnimatedAxis,
  AnimatedGrid,
  AnimatedLineSeries,
  XYChart,
} from "@visx/xychart";

import type {
  FloatDatum,
  FloatPanelEntry,
  PanelComponentProps,
} from "../types";
import {
  MARGIN,
  MARGIN_NO_BOTTOM,
  AXIS_EXTRA,
  CHART_COLORS,
  lineChartTheme,
  floatAccessors,
  legendStyle,
  legendItemStyle,
  legendLabelStyle,
} from "../constants";
import { LegendSwatch } from "../LegendSwatch";
import { ScaleCapture } from "../ScaleCapture";
import { FloatScaleContext } from "../FloatScaleContext";

export function FloatPanel({
  entry,
  timestamps,
  width,
  isLast,
}: PanelComponentProps) {
  const { series, values, height } = entry as FloatPanelEntry;
  const ctx = useContext(FloatScaleContext);

  return (
    <div ref={ctx?.panelRef}>
      <div style={legendStyle}>
        {series.map((s, i) => (
          <div key={s.key} style={legendItemStyle}>
            <LegendSwatch
              color={CHART_COLORS[i % CHART_COLORS.length]}
              variant="line"
            />
            <span style={legendLabelStyle}>{s.label}</span>
          </div>
        ))}
      </div>
      <XYChart
        height={height + (isLast ? AXIS_EXTRA : 0)}
        width={width}
        margin={isLast ? MARGIN : MARGIN_NO_BOTTOM}
        xScale={{ type: "time" }}
        yScale={{ type: "linear" }}
        theme={lineChartTheme}
      >
        {ctx?.yScaleRef && <ScaleCapture yScaleRef={ctx.yScaleRef} />}
        {isLast && <AnimatedAxis orientation="bottom" numTicks={5} />}
        <AnimatedAxis orientation="left" />
        <AnimatedGrid columns={false} />
        {series.map((s) => {
          const data = timestamps
            .map((t, i) => ({
              timestamp: t,
              value: values[s.key]?.[i],
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
  );
}
