import { useMemo } from "react";
import { AnimatedAxis, AnimatedAreaSeries, XYChart } from "@visx/xychart";
import { curveStepAfter } from "@visx/curve";

import type {
  BoolDatum,
  StringPanelEntry,
  PanelComponentProps,
} from "../types";
import {
  MARGIN,
  MARGIN_NO_BOTTOM,
  AXIS_EXTRA,
  CHART_COLORS,
  boolAccessors,
  legendStyle,
  legendItemStyle,
  legendLabelStyle,
} from "../constants";
import { LegendSwatch } from "../LegendSwatch";

/** Extract unique non-null values in first-seen order. */
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

export function StringPanel({
  entry,
  timestamps,
  width,
  isLast,
}: PanelComponentProps) {
  const { series, values, height } = entry as StringPanelEntry;
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
              {series.label}: {val}
            </span>
          </div>
        ))}
      </div>
      <XYChart
        height={height + (isLast ? AXIS_EXTRA : 0)}
        width={width}
        margin={isLast ? MARGIN : MARGIN_NO_BOTTOM}
        xScale={{ type: "time" }}
        yScale={{ type: "linear", domain: [0, 1] }}
      >
        {isLast && <AnimatedAxis orientation="bottom" numTicks={5} />}
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
              key={`${series.key}::${val}`}
              dataKey={`${series.key}::${val}`}
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
