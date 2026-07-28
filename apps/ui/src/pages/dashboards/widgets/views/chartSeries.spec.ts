import { describe, it, expect } from "vitest";
import type { DataPoint } from "@gridone/sdk";
import { singleSeriesChartProps } from "./chartSeries";

const POINTS: DataPoint[] = [
  { timestamp: "2026-07-28T10:00:00Z", value: 21.5 },
  { timestamp: "2026-07-28T10:05:00Z", value: 22 },
];

describe("singleSeriesChartProps", () => {
  it("indexes every panel on the same timestamps", () => {
    const { timestamps } = singleSeriesChartProps(
      "float",
      "temperature",
      "Temperature",
      POINTS,
    );
    expect(timestamps).toEqual([
      new Date("2026-07-28T10:00:00Z"),
      new Date("2026-07-28T10:05:00Z"),
    ]);
  });

  it("puts floats on the line panel", () => {
    const props = singleSeriesChartProps(
      "float",
      "temperature",
      "Temperature",
      POINTS,
    );
    expect(props.lineSeries).toEqual([
      { key: "temperature", label: "Temperature" },
    ]);
    expect(props.lineValues).toEqual({ temperature: [21.5, 22] });
    expect(props.booleanSeries).toBeUndefined();
    expect(props.stringSeries).toBeUndefined();
  });

  // Ints ride the float panel's y-axis, stepped — so they must land on
  // intSeries, not lineSeries, or they render as interpolated lines.
  it("puts ints on the int panel, not the line panel", () => {
    const props = singleSeriesChartProps("int", "fan_speed", "Fan speed", [
      { timestamp: "2026-07-28T10:00:00Z", value: 3 },
    ]);
    expect(props.intValues).toEqual({ fan_speed: [3] });
    expect(props.lineSeries).toBeUndefined();
  });

  it("puts bools on their own categorical panel", () => {
    const props = singleSeriesChartProps("bool", "on_off", "On/off", [
      { timestamp: "2026-07-28T10:00:00Z", value: true },
      { timestamp: "2026-07-28T10:05:00Z", value: false },
    ]);
    expect(props.booleanSeries).toEqual([{ key: "on_off", label: "On/off" }]);
    expect(props.booleanValues).toEqual({ on_off: [true, false] });
    expect(props.lineSeries).toBeUndefined();
  });

  it("puts strings on their own categorical panel", () => {
    const props = singleSeriesChartProps("str", "mode", "Mode", [
      { timestamp: "2026-07-28T10:00:00Z", value: "heating" },
    ]);
    expect(props.stringSeries).toEqual([{ key: "mode", label: "Mode" }]);
    expect(props.stringValues).toEqual({ mode: ["heating"] });
  });

  it("survives an empty series", () => {
    const props = singleSeriesChartProps("float", "temperature", "T", []);
    expect(props.timestamps).toEqual([]);
    expect(props.lineValues).toEqual({ temperature: [] });
  });
});
