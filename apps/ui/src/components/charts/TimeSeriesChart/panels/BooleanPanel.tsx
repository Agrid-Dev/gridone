import { AnimatedAxis, AnimatedAreaSeries, XYChart } from "@visx/xychart";
import { curveStepAfter } from "@visx/curve";

import type {
  BoolDatum,
  BooleanPanelEntry,
  PanelComponentProps,
} from "../types";
import {
  MARGIN,
  MARGIN_NO_BOTTOM,
  AXIS_EXTRA,
  BOOL_COLOR,
  boolAccessors,
  legendStyle,
  legendItemStyle,
  legendLabelStyle,
} from "../constants";
import { LegendSwatch } from "../LegendSwatch";

export function BooleanPanel({
  entry,
  timestamps,
  width,
  isLast,
}: PanelComponentProps) {
  const { series, values, height } = entry as BooleanPanelEntry;

  const data = timestamps
    .map((t, i) => {
      const raw = values[i];
      if (raw === null || raw === undefined) return null;
      return { timestamp: t, value: raw ? 1 : 0 };
    })
    .filter((d): d is BoolDatum => d !== null);

  return (
    <div>
      <div style={legendStyle}>
        <div style={legendItemStyle}>
          <LegendSwatch color={BOOL_COLOR} variant="area" />
          <span style={legendLabelStyle}>{series.label}</span>
        </div>
      </div>
      <XYChart
        height={height + (isLast ? AXIS_EXTRA : 0)}
        width={width}
        margin={isLast ? MARGIN : MARGIN_NO_BOTTOM}
        xScale={{ type: "time" }}
        yScale={{ type: "linear", domain: [0, 1] }}
      >
        {isLast && <AnimatedAxis orientation="bottom" numTicks={5} />}
        <AnimatedAreaSeries
          dataKey={series.key}
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
}
