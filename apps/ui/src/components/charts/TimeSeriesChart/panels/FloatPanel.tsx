import { useContext, useMemo } from "react";
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
import { commonAttributeUnit } from "@/lib/attributeUnits";

export function FloatPanel({
  entry,
  timestamps,
  width,
  isLast,
}: PanelComponentProps) {
  const { series, values, stepKeys, height } = entry as FloatPanelEntry;
  const stepKeySet = new Set(stepKeys);
  const ctx = useContext(FloatScaleContext);

  /** Ticks carry the unit when every series on this shared axis has the same
   *  one. `semanticKey` names the attribute when the series is keyed by
   *  something else (a dashboard chart keys per device), same as the string
   *  panel's colour lookup.
   *
   *  Kept on the runtime locale rather than the app's: this subtree takes all
   *  its text from props and pulling i18n in for a decimal separator would
   *  make every chart consumer wire up a translation provider. */
  const formatTick = useMemo(() => {
    const unit = commonAttributeUnit(series.map((s) => s.semanticKey ?? s.key));
    // A tick label must hold no whitespace: `@visx/text` wraps on it, so
    // "10 000 W" renders stacked over three lines. Hence no group separator
    // (a narrow no-break space in several locales) and no space before the
    // unit. Intl still rounds away d3's binary tick noise (0.30000000000004)
    // and keeps the locale's decimal separator.
    const number = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
      useGrouping: false,
    });
    return (value: number) => `${number.format(value)}${unit ?? ""}`;
  }, [series]);

  return (
    <div ref={ctx?.panelRef}>
      <div style={legendStyle}>
        {series.map((s, i) => (
          <div key={s.key} style={legendItemStyle}>
            <LegendSwatch
              color={CHART_COLORS[i % CHART_COLORS.length]}
              variant="line"
              dash={s.dash}
            />
            <span style={legendLabelStyle}>{s.label}</span>
          </div>
        ))}
      </div>
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
