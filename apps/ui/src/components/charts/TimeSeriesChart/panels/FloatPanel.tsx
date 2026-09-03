import { useContext } from "react";
import { Axis, Grid, LineSeries, XYChart } from "@visx/xychart";
import { curveStepAfter } from "@visx/curve";

import type {
  FloatDatum,
  FloatPanelEntry,
  PanelComponentProps,
} from "../types";
import {
  MARGIN,
  MARGIN_NO_BOTTOM,
  AXIS_EXTRA,
  lineChartTheme,
  floatAccessors,
} from "../constants";
import { PanelLegend } from "../PanelLegend";
import { ScaleCapture } from "../ScaleCapture";
import { FloatScaleContext } from "../FloatScaleContext";
import { useValueTickFormat } from "../useValueTickFormat";

export function FloatPanel({
  entry,
  timestamps,
  width,
  isLast,
}: PanelComponentProps) {
  const { series, values, stepKeys, height } = entry as FloatPanelEntry;
  const stepKeySet = new Set(stepKeys);
  const ctx = useContext(FloatScaleContext);

  const formatTick = useValueTickFormat(series);

  return (
    <div ref={ctx?.panelRef}>
      <PanelLegend series={series} variant="line" />
      <XYChart
        height={height + (isLast ? AXIS_EXTRA : 0)}
        width={width}
        margin={isLast ? MARGIN : MARGIN_NO_BOTTOM}
        xScale={{
          type: "time",
          domain:
            timestamps.length >= 2
              ? [timestamps[0], timestamps[timestamps.length - 1]]
              : undefined,
        }}
        // visx defaults linear scales to `zero: true`, which pins the y-axis
        // to 0 and squashes series that hover far from it (AGR-883).
        yScale={{ type: "linear", zero: false }}
        theme={lineChartTheme}
      >
        {ctx?.yScaleRef && <ScaleCapture yScaleRef={ctx.yScaleRef} />}
        {isLast && <Axis orientation="bottom" numTicks={5} />}
        {/* A tick-count hint: d3 rounds to nice steps, so ~4-6 gridlines
            instead of the dense default ladder. */}
        <Axis
          orientation="left"
          numTicks={4}
          tickFormat={formatTick}
          // visx tags both axes with the same class; naming the value axis
          // tells it apart from the time axis in the DOM.
          axisClassName="visx-axis-value"
        />
        <Grid columns={false} numTicks={4} />
        {series.map((s) => {
          const data = timestamps
            .map((t, i) => ({
              timestamp: t,
              value: values[s.key]?.[i],
            }))
            .filter((d): d is FloatDatum => d.value !== null);
          return (
            <LineSeries
              key={s.key}
              dataKey={s.key}
              data={data}
              // Integer series step between values; floats interpolate linearly.
              curve={stepKeySet.has(s.key) ? curveStepAfter : undefined}
              strokeDasharray={s.dash ? "6 4" : undefined}
              {...floatAccessors}
            />
          );
        })}
      </XYChart>
    </div>
  );
}
