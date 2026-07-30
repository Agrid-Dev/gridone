import { describe, it, expect } from "vitest";
import type { DataPoint } from "@gridone/sdk";
import {
  holdLastValueUntil,
  multiSeriesChartProps,
  singleSeriesChartProps,
} from "./chartSeries";

const POINTS: DataPoint[] = [
  { timestamp: "2026-07-28T10:00:00Z", value: 21.5 },
  { timestamp: "2026-07-28T10:05:00Z", value: 22 },
];

describe("holdLastValueUntil", () => {
  const END = new Date("2026-07-28T13:00:00Z");

  // The case that motivated this: a setpoint nobody touched all period is one
  // point, and one point draws nothing at all.
  it("spans the window for an attribute that never changed", () => {
    const held = holdLastValueUntil(
      [{ timestamp: "2026-07-28T09:00:00Z", value: 21 }],
      END,
    );
    expect(held).toEqual([
      { timestamp: "2026-07-28T09:00:00Z", value: 21 },
      { timestamp: END.toISOString(), value: 21 },
    ]);
  });

  it("carries the last value, not the first", () => {
    const held = holdLastValueUntil(
      [
        { timestamp: "2026-07-28T09:00:00Z", value: "heating" },
        { timestamp: "2026-07-28T10:00:00Z", value: "cooling" },
      ],
      END,
    );
    expect(held[held.length - 1]).toEqual({
      timestamp: END.toISOString(),
      value: "cooling",
    });
  });

  // A synthetic point must not claim a command was issued at that moment.
  it("does not carry the command id onto the synthetic point", () => {
    const held = holdLastValueUntil(
      [{ timestamp: "2026-07-28T09:00:00Z", value: 21, command_id: 7 }],
      END,
    );
    expect(held[1]).not.toHaveProperty("command_id");
  });

  it("leaves an empty series alone", () => {
    expect(holdLastValueUntil([], END)).toEqual([]);
  });

  it("adds nothing when the series already reaches the window end", () => {
    const points = [{ timestamp: "2026-07-28T13:30:00Z", value: 21 }];
    expect(holdLastValueUntil(points, END)).toBe(points);
  });
});

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

  // Widget series are keyed per device, so value colours (hvac modes,
  // statuses) resolve from the attribute carried as the semantic key — not
  // from the device id the panel would otherwise look up.
  it("carries the attribute as the semantic key on device-keyed series", () => {
    const props = multiSeriesChartProps(
      "str",
      [
        { key: "dev1", label: "Thermostat 1", points: [] },
        { key: "dev2", label: "Thermostat 2", points: [] },
      ],
      "mode",
    );
    expect(props.stringSeries).toEqual([
      { key: "dev1", label: "Thermostat 1", semanticKey: "mode" },
      { key: "dev2", label: "Thermostat 2", semanticKey: "mode" },
    ]);
  });
});

describe("multiSeriesChartProps", () => {
  // Devices record on their own clocks, and points mean "held until the next
  // one" — so the merged index carries each series' value forward over the
  // other's timestamps rather than punching holes in the lines.
  it("merges series onto one index with per-series forward-fill", () => {
    const props = multiSeriesChartProps("float", [
      {
        key: "dev1",
        label: "Thermostat 1",
        points: [{ timestamp: "2026-07-28T10:00:00Z", value: 21 }],
      },
      {
        key: "dev2",
        label: "Thermostat 2",
        points: [{ timestamp: "2026-07-28T10:05:00Z", value: 23 }],
      },
    ]);

    expect(props.timestamps).toEqual([
      new Date("2026-07-28T10:00:00Z"),
      new Date("2026-07-28T10:05:00Z"),
    ]);
    expect(props.lineSeries).toEqual([
      { key: "dev1", label: "Thermostat 1" },
      { key: "dev2", label: "Thermostat 2" },
    ]);
    expect(props.lineValues).toEqual({
      dev1: [21, 21],
      dev2: [null, 23],
    });
  });

  // One device must chart exactly as it always has: no merge, no rounding —
  // the same props the single-series projection produces.
  it("keeps a lone series' exact shape", () => {
    const series = { key: "dev1", label: "Thermostat 1", points: POINTS };
    expect(multiSeriesChartProps("float", [series])).toEqual(
      singleSeriesChartProps("float", "dev1", "Thermostat 1", POINTS),
    );
  });
});
