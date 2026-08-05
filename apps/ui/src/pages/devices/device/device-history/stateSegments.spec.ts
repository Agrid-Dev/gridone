import { describe, expect, it } from "vitest";
import type { MergedRow } from "@/lib/mergeTimeSeries";
import {
  MAX_TIMELINE_VALUES,
  OTHER_VALUE,
  computeStateSegments,
} from "./stateSegments";

const MIN = 60_000;

function row(tsMs: number, value: string | boolean | null): MergedRow {
  return {
    timestamp: new Date(tsMs).toISOString(),
    values: { s: value },
    previousValues: {},
    commandIds: {},
    isNew: {},
  };
}

describe("computeStateSegments", () => {
  it("groups consecutive equal values and weights shares by duration", () => {
    const rows = [
      row(0, "heat"),
      row(1 * MIN, "heat"),
      row(2 * MIN, "cool"),
      row(3 * MIN, "cool"), // held-to-end sentinel
    ];

    const { segments, shares } = computeStateSegments(rows, "s");

    expect(segments).toEqual([
      { value: "heat", startMs: 0, endMs: 2 * MIN },
      { value: "cool", startMs: 2 * MIN, endMs: 3 * MIN },
    ]);
    expect(shares).toEqual([
      { value: "heat", ms: 2 * MIN, pct: 67 },
      { value: "cool", ms: 1 * MIN, pct: 33 },
    ]);
  });

  it("gives the final run its width through the held sentinel row", () => {
    const rows = [row(0, "auto"), row(10 * MIN, "auto")];

    const { segments, shares } = computeStateSegments(rows, "s");

    expect(segments).toEqual([{ value: "auto", startMs: 0, endMs: 10 * MIN }]);
    expect(shares).toEqual([{ value: "auto", ms: 10 * MIN, pct: 100 }]);
  });

  it("stringifies booleans so one code path serves bool and str series", () => {
    const rows = [row(0, true), row(1 * MIN, false), row(4 * MIN, false)];

    const { segments, shares } = computeStateSegments(rows, "s");

    expect(segments.map((s) => s.value)).toEqual(["true", "false"]);
    expect(shares).toEqual([
      { value: "false", ms: 3 * MIN, pct: 75 },
      { value: "true", ms: 1 * MIN, pct: 25 },
    ]);
  });

  it("keeps a leading null stretch as a segment excluded from shares", () => {
    const rows = [row(0, null), row(2 * MIN, "on"), row(4 * MIN, "on")];

    const { segments, shares } = computeStateSegments(rows, "s");

    expect(segments).toEqual([
      { value: null, startMs: 0, endMs: 2 * MIN },
      { value: "on", startMs: 2 * MIN, endMs: 4 * MIN },
    ]);
    expect(shares).toEqual([{ value: "on", ms: 2 * MIN, pct: 100 }]);
  });

  it("folds values beyond the cap into an 'other' share by total duration", () => {
    // v1 held 8 min, v2 7 min, … v8 1 min: 36 min total, v7+v8 fold.
    const rows: MergedRow[] = [];
    let ts = 0;
    for (let i = 1; i <= 8; i++) {
      rows.push(row(ts, `v${i}`));
      ts += (9 - i) * MIN;
    }
    rows.push(row(ts, "v8"));

    const { shares } = computeStateSegments(rows, "s");

    expect(shares).toHaveLength(MAX_TIMELINE_VALUES + 1);
    expect(shares[0]).toEqual({ value: "v1", ms: 8 * MIN, pct: 22 });
    expect(shares.at(-1)).toEqual({ value: OTHER_VALUE, ms: 3 * MIN, pct: 8 });
  });

  it("returns empty results for empty rows", () => {
    expect(computeStateSegments([], "s")).toEqual({
      segments: [],
      shares: [],
    });
  });
});
