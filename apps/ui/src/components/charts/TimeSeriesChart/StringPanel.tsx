import { useMemo } from "react";
import { AnimatedAxis, AnimatedAreaSeries, XYChart } from "@visx/xychart";
import { curveStepAfter } from "@visx/curve";

import type { BoolDatum } from "./types";
import {
  MARGIN,
  MARGIN_NO_BOTTOM,
  AXIS_EXTRA,
  CHART_COLORS,
  boolAccessors,
  legendStyle,
  legendItemStyle,
  legendLabelStyle,
} from "./constants";
import { LegendSwatch } from "./LegendSwatch";

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
export function StringPanel({
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
