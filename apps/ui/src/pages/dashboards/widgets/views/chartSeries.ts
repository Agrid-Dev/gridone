import type { DataPoint, DataType } from "@gridone/sdk";
import type { TimeSeriesChartProps } from "@/components/charts/TimeSeriesChart";

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
): TimeSeriesChartProps {
  const timestamps = points.map((p) => new Date(p.timestamp));
  const series = [{ key, label }];
  const values = points.map((p) => p.value);

  switch (dataType) {
    case "float":
      return {
        timestamps,
        lineSeries: series,
        lineValues: { [key]: values as (number | null)[] },
      };
    case "int":
      return {
        timestamps,
        intSeries: series,
        intValues: { [key]: values as (number | null)[] },
      };
    case "bool":
      return {
        timestamps,
        booleanSeries: series,
        booleanValues: { [key]: values as (boolean | null)[] },
      };
    case "str":
      return {
        timestamps,
        stringSeries: series,
        stringValues: { [key]: values as (string | null)[] },
      };
  }
}
