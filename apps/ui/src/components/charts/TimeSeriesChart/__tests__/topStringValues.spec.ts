import { describe, it, expect } from "vitest";

import { computeTopStringValues } from "../topStringValues";
import { MAX_STRING_VALUES } from "../constants";

/** Helper: timestamps N minutes apart from a fixed epoch. */
function makeTimestamps(count: number, intervalMs = 60_000): Date[] {
  const start = new Date("2025-01-01T00:00:00Z").getTime();
  return Array.from(
    { length: count },
    (_, i) => new Date(start + i * intervalMs),
  );
}

describe("computeTopStringValues", () => {
  it("returns all values when ≤ MAX_STRING_VALUES", () => {
    const values = ["a", "b", "c", "a", "b", null];
    const timestamps = makeTimestamps(values.length);

    const result = computeTopStringValues(values, timestamps);

    expect(result.hasOther).toBe(false);
    expect(result.displayValues).toEqual(["a", "b", "c"]);
    expect(result.topSet).toEqual(new Set(["a", "b", "c"]));
  });

  it("ranks by duration, not frequency", () => {
    // "long" appears once spanning 1 hour (3_600_000 ms)
    // "short" appears 100 times spanning 1 second each (1_000 ms)
    const timestamps: Date[] = [];
    const values: string[] = [];
    const start = new Date("2025-01-01T00:00:00Z").getTime();

    // First entry: "long" at t=0, next timestamp at t=1h
    timestamps.push(new Date(start));
    values.push("long");
    timestamps.push(new Date(start + 3_600_000));
    values.push("short");

    // 99 more "short" entries, each 1 second apart
    for (let i = 1; i < 100; i++) {
      timestamps.push(new Date(start + 3_600_000 + i * 1_000));
      values.push("short");
    }

    // Add enough unique filler values to exceed MAX_STRING_VALUES
    for (let i = 0; i < MAX_STRING_VALUES; i++) {
      timestamps.push(new Date(start + 3_700_000 + i * 1_000));
      values.push(`filler_${i}`);
    }

    const result = computeTopStringValues(values, timestamps);

    expect(result.hasOther).toBe(true);
    expect(result.displayValues.length).toBe(MAX_STRING_VALUES);
    // "long" should rank above "short" despite appearing only once
    const longIdx = result.displayValues.indexOf("long");
    const shortIdx = result.displayValues.indexOf("short");
    expect(longIdx).not.toBe(-1);
    expect(shortIdx).not.toBe(-1);
    expect(longIdx).toBeLessThan(shortIdx);
  });

  it("groups excess values into Other", () => {
    const count = 200;
    const timestamps = makeTimestamps(count);
    const values = Array.from({ length: count }, (_, i) => `state_${i}`);

    const result = computeTopStringValues(values, timestamps);

    expect(result.hasOther).toBe(true);
    expect(result.displayValues.length).toBe(MAX_STRING_VALUES);
    expect(result.topSet.size).toBe(MAX_STRING_VALUES);
  });
});
