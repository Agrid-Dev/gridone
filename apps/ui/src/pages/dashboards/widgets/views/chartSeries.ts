import type { DataPoint, DataType } from "@gridone/sdk";
import type { TimeSeriesChartProps } from "@/components/charts/TimeSeriesChart";
import { mergeTimeSeries } from "@/lib/mergeTimeSeries";

/** How numeric series are drawn — the chart's own vocabulary, which the
 *  widget config happens to share. */
export type NumericMark = "line" | "bar";

/** One series to plot: the device it belongs to (`key`), how the legend names
 *  it (`label`), and its points over the window. */
export type ChartSeriesInput = {
  key: string;
  label: string;
  points: DataPoint[];
};

/**
 * Repeat the last recorded value at *end* so the series spans the whole window.
 *
 * A point is only recorded when the value changes, so an attribute that has
 * held steady all period returns a single point — and one point draws no line
 * at all (the panel drops its x-domain below two). Holding the value to the end
 * of the window is what the data already means: it stayed there.
 *
 * The API's `carry_forward` does the mirror image at the leading edge,
 * synthesizing a point at the window start from the last value before it.
 */
export function holdLastValueUntil(
  points: DataPoint[],
  end: Date,
): DataPoint[] {
  const last = points[points.length - 1];
  if (!last || new Date(last.timestamp) >= end) return points;
  // Value only — the synthetic point carries no `command_id`, which would
  // claim a command was issued at a time nothing happened.
  return [...points, { timestamp: end.toISOString(), value: last.value }];
}

/**
 * Project one attribute's points onto the chart's props.
 *
 * The chart takes columnar data — a shared timestamp index plus a values array
 * per series — and picks a panel per data type: numbers share a line panel
 * (ints stepped), while booleans and strings each get their own categorical
 * panel. Which of the four prop pairs to fill is the only decision here, and
 * `DataType` is closed, so every attribute is chartable.
 */
export function singleSeriesChartProps(
  dataType: DataType,
  key: string,
  label: string,
  points: DataPoint[],
  attribute?: string,
  mark: NumericMark = "line",
): TimeSeriesChartProps {
  const timestamps = points.map((p) => new Date(p.timestamp));
  return chartPropsFor(
    dataType,
    timestamps,
    [{ key, label, semanticKey: attribute }],
    { [key]: points.map((p) => p.value) },
    mark,
  );
}

/**
 * Project several devices' points — one attribute, one shared data type — onto
 * the chart's props.
 *
 * Each series records on its own clock, so their timestamps are merged into
 * one index with per-series forward-fill (`mergeTimeSeries`): a value holds
 * until the next one, which is what change-recorded points mean. A single
 * series bypasses the merge and keeps its exact timestamps — one device must
 * chart exactly as it always has.
 */
export function multiSeriesChartProps(
  dataType: DataType,
  series: ChartSeriesInput[],
  attribute?: string,
  mark: NumericMark = "line",
): TimeSeriesChartProps {
  if (series.length === 1) {
    const [s] = series;
    return singleSeriesChartProps(
      dataType,
      s.key,
      s.label,
      s.points,
      attribute,
      mark,
    );
  }

  const rows = mergeTimeSeries(
    Object.fromEntries(series.map((s) => [s.key, s.points])),
    series.map((s) => s.key),
  );
  const timestamps = rows.map((r) => new Date(r.timestamp));
  const values = Object.fromEntries(
    series.map((s) => [s.key, rows.map((r) => r.values[s.key])]),
  );
  return chartPropsFor(
    dataType,
    timestamps,
    // Series are keyed per device, so each carries the attribute as its
    // semantic key — value colours (hvac modes, statuses) resolve from the
    // attribute, not the device.
    series.map(({ key, label }) => ({ key, label, semanticKey: attribute })),
    values,
    mark,
  );
}

/** Fill the prop pair the data type calls for (see `singleSeriesChartProps`).
 *
 *  The mark rides along on the numeric branches only: bars stand for a value
 *  measured over a span, which is what a bucket of numbers reduces to. A
 *  boolean or a string panel already draws its own spans as bands, so there is
 *  no second mark for them to take, and a chart whose type has drifted to one
 *  of those simply keeps its natural form. */
function chartPropsFor(
  dataType: DataType,
  timestamps: Date[],
  series: { key: string; label: string; semanticKey?: string }[],
  values: Record<string, (DataPoint["value"] | null)[]>,
  mark: NumericMark,
): TimeSeriesChartProps {
  switch (dataType) {
    case "float":
      return {
        timestamps,
        numericMark: mark,
        lineSeries: series,
        lineValues: values as Record<string, (number | null)[]>,
      };
    case "int":
      return {
        timestamps,
        numericMark: mark,
        intSeries: series,
        intValues: values as Record<string, (number | null)[]>,
      };
    case "bool":
      return {
        timestamps,
        booleanSeries: series,
        booleanValues: values as Record<string, (boolean | null)[]>,
      };
    case "str":
      return {
        timestamps,
        stringSeries: series,
        stringValues: values as Record<string, (string | null)[]>,
      };
  }
}
