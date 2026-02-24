import { describe, it, expect } from "vitest";
import { nearestIndex } from "./nearestIndex";

// MARGIN.left = 48, MARGIN.right = 16 → chart area spans [48, width-16]

const ts = (...times: number[]) => times.map((t) => new Date(t));

describe("nearestIndex", () => {
  it("returns null for empty timestamps", () => {
    expect(nearestIndex(100, 500, [])).toBeNull();
  });

  it("returns 0 for a single timestamp", () => {
    expect(nearestIndex(100, 500, ts(1000))).toBe(0);
  });

  it("returns null when chart width is zero or negative", () => {
    // width 64 → chartWidth = 64 - 48 - 16 = 0
    expect(nearestIndex(50, 64, ts(1000, 2000))).toBeNull();
    expect(nearestIndex(50, 10, ts(1000, 2000))).toBeNull();
  });

  it("returns first index when cursor is at the left edge", () => {
    // cursor at MARGIN.left (48) → fraction ≈ 0 → target ≈ t0
    expect(nearestIndex(48, 500, ts(0, 1000, 2000))).toBe(0);
  });

  it("returns last index when cursor is at the right edge", () => {
    // cursor at width - MARGIN.right (484) → fraction ≈ 1 → target ≈ tN
    expect(nearestIndex(484, 500, ts(0, 1000, 2000))).toBe(2);
  });

  it("finds the nearest timestamp by binary search", () => {
    const timestamps = ts(0, 100, 200, 300, 400);
    const width = 500;
    // chartWidth = 500 - 48 - 16 = 436
    // To target t=150, fraction = 150/400 = 0.375, cursorX = 48 + 0.375 * 436 = 211.5
    // Should pick index 1 (t=100) or 2 (t=200) — 150 is equidistant, binary search lands on 2,
    // then checks prev: |100-150|=50 vs |200-150|=50 → prev not strictly less, returns 2
    expect(nearestIndex(211.5, width, timestamps)).toBe(2);

    // Cursor closer to t=100: target ~120, fraction = 120/400 = 0.3, cursorX = 48 + 0.3*436 = 178.8
    // |100-120|=20 vs |200-120|=80 → picks index 1
    expect(nearestIndex(178.8, width, timestamps)).toBe(1);
  });

  it("picks the previous index when it is strictly closer", () => {
    const timestamps = ts(0, 1000);
    const width = 500;
    // chartWidth = 436, to target 400: fraction = 400/1000 = 0.4, cursorX = 48 + 0.4*436 = 222.4
    // |0-400|=400 vs |1000-400|=600 → picks index 0
    expect(nearestIndex(222.4, width, timestamps)).toBe(0);
  });

  it("picks the current index when it is closer", () => {
    const timestamps = ts(0, 1000);
    const width = 500;
    // target 700: fraction = 0.7, cursorX = 48 + 0.7*436 = 353.2
    // |0-700|=700 vs |1000-700|=300 → picks index 1
    expect(nearestIndex(353.2, width, timestamps)).toBe(1);
  });

  it("works with many evenly spaced timestamps", () => {
    const timestamps = ts(...Array.from({ length: 100 }, (_, i) => i * 10));
    const width = 500;
    // chartWidth = 436, last time = 990
    // target ~500: fraction = 500/990, cursorX = 48 + (500/990)*436 ≈ 268.2
    const idx = nearestIndex(268.2, width, timestamps);
    expect(idx).not.toBeNull();
    // The found timestamp should be the closest to target
    const chartWidth = 436;
    const fraction = (268.2 - 48) / chartWidth;
    const target = fraction * 990;
    const found = timestamps[idx!].getTime();
    const diff = Math.abs(found - target);
    // Should be within half a step (5ms)
    expect(diff).toBeLessThanOrEqual(5);
  });
});
