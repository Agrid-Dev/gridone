import { describe, it, expect } from "vitest";
import { indexAtOrBefore, timeAtCursor } from "./hoverPoint";

// MARGIN.left = 48, MARGIN.right = 16 → chart area spans [48, width-16]
const WIDTH = 500;
const CHART_WIDTH = WIDTH - 48 - 16; // 436

const ts = (...times: number[]) => times.map((t) => new Date(t));

/** Cursor pixel that lands on `time`, given a `[0, span]` domain. */
const cursorAt = (time: number, span: number) =>
  48 + (time / span) * CHART_WIDTH;

describe("timeAtCursor", () => {
  it("returns null for empty timestamps", () => {
    expect(timeAtCursor(100, WIDTH, [])).toBeNull();
  });

  it("returns the only timestamp when there is one", () => {
    expect(timeAtCursor(100, WIDTH, ts(1000))).toEqual(new Date(1000));
  });

  it("returns null when the plot area has no width", () => {
    expect(timeAtCursor(50, 64, ts(1000, 2000))).toBeNull();
    expect(timeAtCursor(50, 10, ts(1000, 2000))).toBeNull();
  });

  it("reads the domain edges at the plot edges", () => {
    const timestamps = ts(0, 1000, 2000);
    expect(timeAtCursor(48, WIDTH, timestamps)).toEqual(new Date(0));
    expect(timeAtCursor(484, WIDTH, timestamps)).toEqual(new Date(2000));
  });

  // The point of the change: the cursor names its own instant, so a series with
  // two points still reports a moving clock across the plot.
  it("reads an instant between points, not a point's timestamp", () => {
    const at = timeAtCursor(cursorAt(400, 1000), WIDTH, ts(0, 1000));
    expect(at?.getTime()).toBeCloseTo(400, 6);
  });

  it("clamps to the domain outside the plot area", () => {
    const timestamps = ts(0, 1000);
    expect(timeAtCursor(0, WIDTH, timestamps)).toEqual(new Date(0));
    expect(timeAtCursor(WIDTH, WIDTH, timestamps)).toEqual(new Date(1000));
  });
});

describe("indexAtOrBefore", () => {
  it("returns null for empty timestamps", () => {
    expect(indexAtOrBefore([], new Date(100))).toBeNull();
  });

  it("returns null before the first point", () => {
    expect(indexAtOrBefore(ts(1000, 2000), new Date(500))).toBeNull();
  });

  // The regression: 900 is nearer to the 1000 reading, but at 900 the value in
  // force is still the one recorded at 0.
  it("holds the earlier value even when the later point is nearer", () => {
    expect(indexAtOrBefore(ts(0, 1000), new Date(900))).toBe(0);
  });

  it("takes a point exactly at its own timestamp", () => {
    expect(indexAtOrBefore(ts(0, 1000, 2000), new Date(1000))).toBe(1);
  });

  it("holds the last value past the final point", () => {
    expect(indexAtOrBefore(ts(0, 1000), new Date(9999))).toBe(1);
  });

  it.each([
    [0, 0],
    [95, 0],
    [100, 1],
    [255, 2],
    [400, 4],
  ])("resolves t=%i to index %i", (time, expected) => {
    expect(indexAtOrBefore(ts(0, 100, 200, 300, 400), new Date(time))).toBe(
      expected,
    );
  });

  it("binary-searches a long series correctly", () => {
    const timestamps = ts(...Array.from({ length: 100 }, (_, i) => i * 10));
    // 505 falls between the readings at 500 (index 50) and 510.
    expect(indexAtOrBefore(timestamps, new Date(505))).toBe(50);
  });
});
