import { describe, expect, it } from "vitest";
import type { CellValue, MergedRow } from "@/lib/mergeTimeSeries";
import { computeChilledWaterKpis, formatRunHours } from "../chilledWaterKpis";

const T0 = "2026-08-05T00:00:00.000Z";
const T1H = "2026-08-05T01:00:00.000Z";
const T4H = "2026-08-05T04:00:00.000Z";

function row(timestamp: string, values: Record<string, CellValue>): MergedRow {
  return { timestamp, values, previousValues: {}, commandIds: {}, isNew: {} };
}

describe("computeChilledWaterKpis", () => {
  it("weights the outlet−setpoint deviation by interval duration", () => {
    // 1 h at deviation 0, then 3 h at deviation 1 → (0·1 + 1·3) / 4
    const kpis = computeChilledWaterKpis([
      row(T0, { outlet_temperature: 7, setpoint_temperature: 7 }),
      row(T1H, { outlet_temperature: 8, setpoint_temperature: 7 }),
      row(T4H, { outlet_temperature: 8, setpoint_temperature: 7 }),
    ]);
    expect(kpis.meanDeviation).toBeCloseTo(0.75);
  });

  it("skips intervals where either temperature is missing", () => {
    const kpis = computeChilledWaterKpis([
      row(T0, { outlet_temperature: 8, setpoint_temperature: null }),
      row(T1H, { outlet_temperature: 8, setpoint_temperature: 7 }),
      row(T4H, { outlet_temperature: 8, setpoint_temperature: 7 }),
    ]);
    expect(kpis.meanDeviation).toBeCloseTo(1);
  });

  it("sums run time over the intervals where the unit is on", () => {
    const kpis = computeChilledWaterKpis([
      row(T0, { onoff_state: true }),
      row(T1H, { onoff_state: false }),
      row(T4H, { onoff_state: false }),
    ]);
    expect(kpis.runSeconds).toBe(3600);
  });

  it("reports zero run time for a recorded but always-off unit", () => {
    const kpis = computeChilledWaterKpis([
      row(T0, { onoff_state: false }),
      row(T4H, { onoff_state: false }),
    ]);
    expect(kpis.runSeconds).toBe(0);
  });

  it("computes the energy counter delta over the window", () => {
    const kpis = computeChilledWaterKpis([
      row(T0, { energy: 100 }),
      row(T4H, { energy: 164 }),
    ]);
    expect(kpis.energyKwh).toBe(64);
  });

  it("nulls the energy KPI when the counter resets mid-window", () => {
    const kpis = computeChilledWaterKpis([
      row(T0, { energy: 100 }),
      row(T4H, { energy: 3 }),
    ]);
    expect(kpis.energyKwh).toBeNull();
  });

  it("nulls every KPI whose backing metric is never recorded", () => {
    const kpis = computeChilledWaterKpis([
      row(T0, { outlet_temperature: 8 }),
      row(T4H, { outlet_temperature: 8 }),
    ]);
    expect(kpis).toEqual({
      meanDeviation: null,
      runSeconds: null,
      energyKwh: null,
    });
  });

  it("returns all-null on an empty timeline", () => {
    expect(computeChilledWaterKpis([])).toEqual({
      meanDeviation: null,
      runSeconds: null,
      energyKwh: null,
    });
  });
});

describe("formatRunHours", () => {
  it.each([
    [0, "0 h 00"],
    [34200, "9 h 30"],
    [5700, "1 h 35"],
    // 59 min 59 s rounds up to the next hour, not "0 h 60"
    [3599, "1 h 00"],
  ])("formats %d s as %s", (seconds, expected) => {
    expect(formatRunHours(seconds)).toBe(expected);
  });
});
