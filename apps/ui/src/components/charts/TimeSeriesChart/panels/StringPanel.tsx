import { useMemo } from "react";
import { Axis, AnimatedAreaSeries, XYChart } from "@visx/xychart";
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
  OTHER_COLOR,
  boolAccessors,
  legendStyle,
  legendItemStyle,
  legendLabelStyle,
} from "../constants";
import { LegendSwatch } from "../LegendSwatch";
import { computeTopStringValues } from "../topStringValues";

type RenderItem = {
  label: string;
  color: string;
  dataKey: string;
  data: BoolDatum[];
};

export function StringPanel({
  entry,
  timestamps,
  width,
  isLast,
}: PanelComponentProps) {
  const { series, values, height } = entry as StringPanelEntry;

  const { displayValues, hasOther, topSet } = useMemo(
    () => computeTopStringValues(values, timestamps),
    [values, timestamps],
  );

  const renderItems: RenderItem[] = useMemo(() => {
    const items: RenderItem[] = [];

    for (let vi = 0; vi < displayValues.length; vi++) {
      const val = displayValues[vi];
      const data: BoolDatum[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (values[i] === null || values[i] === undefined) continue;
        data.push({
          timestamp: timestamps[i],
          value: values[i] === val ? 1 : 0,
        });
      }
      items.push({
        label: `${series.label}: ${val}`,
        color: CHART_COLORS[vi % CHART_COLORS.length],
        dataKey: `${series.key}::${val}`,
        data,
      });
    }

    if (hasOther) {
      const data: BoolDatum[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (values[i] === null || values[i] === undefined) continue;
        data.push({
          timestamp: timestamps[i],
          value: !topSet.has(values[i]!) ? 1 : 0,
        });
      }
      items.push({
        label: `${series.label}: Other`,
        color: OTHER_COLOR,
        dataKey: `${series.key}::__other__`,
        data,
      });
    }

    return items;
  }, [displayValues, hasOther, topSet, timestamps, values, series]);

  return (
    <>
      <div style={legendStyle}>
        {renderItems.map((item) => (
          <div key={item.dataKey} style={legendItemStyle}>
            <LegendSwatch color={item.color} variant="area" />
            <span style={legendLabelStyle}>{item.label}</span>
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
        yScale={{ type: "linear", domain: [0, 1] }}
      >
        {isLast && <Axis orientation="bottom" numTicks={5} />}
        {renderItems.map((item) => (
          <AnimatedAreaSeries
            key={item.dataKey}
            dataKey={item.dataKey}
            data={item.data}
            curve={curveStepAfter}
            renderLine={false}
            fillOpacity={0.35}
            fill={item.color}
            {...boolAccessors}
          />
        ))}
      </XYChart>
    </>
  );
}
