import { describe, it, expect } from "vitest";
import { mergeTimeSeries } from "./mergeTimeSeries";
import type { DataPoint } from "@/api/timeseries";

const point = (ts: string, value: string | number | boolean): DataPoint => ({
  timestamp: ts,
  value,
});

describe("mergeTimeSeries", () => {
  it("returns empty array for empty input", () => {
    expect(mergeTimeSeries({}, [])).toEqual([]);
  });

  it("returns empty array when attributes have no data", () => {
    expect(mergeTimeSeries({}, ["temperature"])).toEqual([]);
  });

  it("handles single attribute with single point", () => {
    const result = mergeTimeSeries(
      { temperature: [point("2024-01-01T00:00:00.000Z", 22)] },
      ["temperature"],
    );
    expect(result).toHaveLength(1);
    expect(result[0].values.temperature).toBe(22);
    expect(result[0].isNew.temperature).toBe(true);
  });

  it("merges two attributes with different timestamps and forward-fills", () => {
    const result = mergeTimeSeries(
      {
        temperature: [
          point("2024-01-01T00:00:00.000Z", 20),
          point("2024-01-01T00:02:00.000Z", 22),
        ],
        humidity: [point("2024-01-01T00:01:00.000Z", 60)],
      },
      ["temperature", "humidity"],
    );

    // 3 unique timestamps, newest first
    expect(result).toHaveLength(3);

    // Newest: 00:02 — temperature=22 (new), humidity=60 (filled)
    expect(result[0].values.temperature).toBe(22);
    expect(result[0].isNew.temperature).toBe(true);
    expect(result[0].values.humidity).toBe(60);
    expect(result[0].isNew.humidity).toBe(false);

    // Middle: 00:01 — temperature=20 (filled), humidity=60 (new)
    expect(result[1].values.temperature).toBe(20);
    expect(result[1].isNew.temperature).toBe(false);
    expect(result[1].values.humidity).toBe(60);
    expect(result[1].isNew.humidity).toBe(true);

    // Oldest: 00:00 — temperature=20 (new), humidity=null (no earlier data)
    expect(result[2].values.temperature).toBe(20);
    expect(result[2].isNew.temperature).toBe(true);
    expect(result[2].values.humidity).toBeNull();
    expect(result[2].isNew.humidity).toBe(false);
  });

  it("rounds timestamps to precision and keeps the later original", () => {
    const result = mergeTimeSeries(
      {
        temperature: [
          point("2024-01-01T00:00:00.100Z", 20),
          point("2024-01-01T00:00:00.900Z", 25),
        ],
      },
      ["temperature"],
      1000,
    );

    // Both round to the same second → one row, keeps later value (25)
    expect(result).toHaveLength(1);
    expect(result[0].values.temperature).toBe(25);
  });

  it("forward-fills gaps from last known value", () => {
    const result = mergeTimeSeries(
      {
        temperature: [
          point("2024-01-01T00:00:00.000Z", 20),
          point("2024-01-01T00:03:00.000Z", 25),
        ],
        humidity: [
          point("2024-01-01T00:00:00.000Z", 50),
          point("2024-01-01T00:01:00.000Z", 55),
          point("2024-01-01T00:02:00.000Z", 60),
          point("2024-01-01T00:03:00.000Z", 65),
        ],
      },
      ["temperature", "humidity"],
    );

    // At 00:01 and 00:02, temperature should be forward-filled from 20
    const row01 = result.find((r) => new Date(r.timestamp).getMinutes() === 1)!;
    expect(row01.values.temperature).toBe(20);
    expect(row01.isNew.temperature).toBe(false);

    const row02 = result.find((r) => new Date(r.timestamp).getMinutes() === 2)!;
    expect(row02.values.temperature).toBe(20);
    expect(row02.isNew.temperature).toBe(false);
  });

  it("returns rows in descending order (newest first)", () => {
    const result = mergeTimeSeries(
      {
        a: [
          point("2024-01-01T00:00:00.000Z", 1),
          point("2024-01-01T00:01:00.000Z", 2),
          point("2024-01-01T00:02:00.000Z", 3),
        ],
      },
      ["a"],
    );

    const timestamps = result.map((r) => new Date(r.timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeLessThan(timestamps[i - 1]);
    }
  });

  it("marks isNew=false when value is unchanged from previous row", () => {
    const result = mergeTimeSeries(
      {
        temperature: [
          point("2024-01-01T00:00:00.000Z", 20),
          point("2024-01-01T00:01:00.000Z", 20),
          point("2024-01-01T00:02:00.000Z", 22),
        ],
        humidity: [
          point("2024-01-01T00:00:00.000Z", 60),
          point("2024-01-01T00:01:00.000Z", 60),
          point("2024-01-01T00:02:00.000Z", 60),
        ],
      },
      ["temperature", "humidity"],
    );

    expect(result).toHaveLength(3);

    // Newest (00:02): temp changed (20→22), humidity unchanged (60→60)
    expect(result[0].isNew.temperature).toBe(true);
    expect(result[0].isNew.humidity).toBe(false);

    // Middle (00:01): both unchanged from 00:00
    expect(result[1].isNew.temperature).toBe(false);
    expect(result[1].isNew.humidity).toBe(false);

    // Oldest (00:00): first occurrence, non-null → isNew
    expect(result[2].isNew.temperature).toBe(true);
    expect(result[2].isNew.humidity).toBe(true);
  });

  it("fills null for unknown attribute with no data", () => {
    const result = mergeTimeSeries(
      { temperature: [point("2024-01-01T00:00:00.000Z", 20)] },
      ["temperature", "missing_attr"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].values.missing_attr).toBeNull();
    expect(result[0].isNew.missing_attr).toBe(false);
  });
});
