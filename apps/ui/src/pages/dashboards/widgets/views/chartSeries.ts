import type { DataPoint, DataType } from "@gridone/sdk";
import type { TimeSeriesChartProps } from "@/components/charts/TimeSeriesChart";

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
