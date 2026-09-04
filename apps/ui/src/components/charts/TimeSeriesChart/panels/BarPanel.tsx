import { Axis, BarSeries, Grid, XYChart } from "@visx/xychart";

import type { BarPanelEntry, FloatDatum, PanelComponentProps } from "../types";
import {
  MARGIN,
  MARGIN_NO_BOTTOM,
  AXIS_EXTRA,
  lineChartTheme,
  floatAccessors,
} from "../constants";
import { PanelLegend } from "../PanelLegend";
import { bucketStep } from "../bucketStep";
import { useValueTickFormat } from "../useValueTickFormat";

/** Share of a bucket the bars in it fill, leaving the rest as the gutter that
 *  separates one bucket from the next. */
const GROUP_FILL = 0.9;

/**
 * Bars against time, one group per bucket.
 *
 * Bars are the mark for aggregated series, where a point stands for a span
 * rather than an instant — a day's consumption is the whole day, not the
 * moment the day began. Two things follow, and both are why this is its own
 * panel rather than a flag on the line one:
 *
 * - the value axis starts at zero. A bar's height *is* its value, so a scale
 *   floating off the data's minimum (which the line panel deliberately does,
 *   so series far from zero aren't squashed) would make every height read as
 *   a difference from the smallest bucket.
 * - the x domain runs one bucket past the last point, so a bar drawn over the
 *   bucket it reports has somewhere to sit. With `n` buckets across that
 *   domain, each is exactly `innerWidth / n` wide — the layout visx's own
 *   fallback bar width assumes, so the bars tile the axis without a band
 *   scale.
 *
 * Series within a bucket sit side by side: `barPadding` narrows each bar to
 * its share of the bucket, and each series' points are plotted at the centre
 * of its own slot. A lone series lands centred in its bucket, which is the
 * same rule with one slot.
 */
export function BarPanel({
  entry,
  timestamps,
  width,
  isLast,
}: PanelComponentProps) {
  const { series, values, height } = entry as BarPanelEntry;
  const formatTick = useValueTickFormat(series);
  const step = bucketStep(timestamps);

  // Bars fill their slot of a bucket; visx sizes them as
  // `innerWidth / pointCount * (1 - barPadding)`, and the domain below makes
  // `innerWidth / pointCount` one whole bucket.
  const barPadding = 1 - GROUP_FILL / series.length;

  return (
    <div>
      <PanelLegend series={series} variant="area" />
      <XYChart
        height={height + (isLast ? AXIS_EXTRA : 0)}
        width={width}
        margin={isLast ? MARGIN : MARGIN_NO_BOTTOM}
        xScale={{
          type: "time",
          domain:
            timestamps.length >= 2 && step !== null
              ? [
                  timestamps[0],
                  new Date(timestamps[timestamps.length - 1].getTime() + step),
                ]
              : undefined,
        }}
        // Unlike the line panel, bars are read against zero — see above.
        yScale={{ type: "linear", zero: true }}
        theme={lineChartTheme}
      >
        {isLast && <Axis orientation="bottom" numTicks={5} />}
        <Axis
          orientation="left"
          numTicks={4}
          tickFormat={formatTick}
          axisClassName="visx-axis-value"
        />
        <Grid columns={false} numTicks={4} />
        {series.map((s, i) => {
          // Empty buckets are kept rather than filtered out: visx sizes bars
          // by how many points a series carries, so dropping them would widen
          // every remaining bar and close the gap the missing bucket should
          // leave. A null value scales to nothing and simply draws no bar.
          const offset = step !== null ? (step * (i + 0.5)) / series.length : 0;
          const data = timestamps.map((t, j) => ({
            timestamp: new Date(t.getTime() + offset),
            value: values[s.key]?.[j] ?? null,
          })) as FloatDatum[];
          return (
            <BarSeries
              key={s.key}
              dataKey={s.key}
              data={data}
              barPadding={barPadding}
              {...floatAccessors}
            />
          );
        })}
      </XYChart>
    </div>
  );
}
