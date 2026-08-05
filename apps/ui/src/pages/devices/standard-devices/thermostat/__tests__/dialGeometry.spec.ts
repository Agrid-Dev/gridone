import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETPOINT_RANGE,
  DIAL_START_DEG,
  DIAL_SWEEP_DEG,
  arcPath,
  dialRange,
  polarPoint,
  valueToAngle,
  valueToFraction,
} from "../dialGeometry";

describe("dialRange", () => {
  it("uses the device bounds when valid", () => {
    expect(dialRange(15, 25)).toEqual({ min: 15, max: 25 });
  });

  it.each([
    ["min absent", null, 25],
    ["max absent", 15, null],
    ["both absent", null, null],
    ["degenerate (max == min)", 20, 20],
    ["degenerate (max < min)", 25, 15],
  ])("falls back to the default range when %s", (_label, min, max) => {
    expect(dialRange(min, max)).toEqual(DEFAULT_SETPOINT_RANGE);
  });
});

describe("valueToFraction", () => {
  it("maps min, midpoint and max to 0, 0.5 and 1", () => {
    expect(valueToFraction(10, 10, 30)).toBe(0);
    expect(valueToFraction(20, 10, 30)).toBe(0.5);
    expect(valueToFraction(30, 10, 30)).toBe(1);
  });

  it("clamps values outside the range", () => {
    expect(valueToFraction(5, 10, 30)).toBe(0);
    expect(valueToFraction(35, 10, 30)).toBe(1);
  });
});

describe("valueToAngle", () => {
  it("spans the dial sweep from start to start + sweep", () => {
    expect(valueToAngle(10, 10, 30)).toBe(DIAL_START_DEG);
    expect(valueToAngle(20, 10, 30)).toBe(DIAL_START_DEG + DIAL_SWEEP_DEG / 2);
    expect(valueToAngle(30, 10, 30)).toBe(DIAL_START_DEG + DIAL_SWEEP_DEG);
  });
});

describe("polarPoint", () => {
  it("places 0° at 3 o'clock and 90° at the bottom (SVG y grows down)", () => {
    const right = polarPoint(0, 0, 10, 0);
    expect(right.x).toBeCloseTo(10);
    expect(right.y).toBeCloseTo(0);

    const bottom = polarPoint(0, 0, 10, 90);
    expect(bottom.x).toBeCloseTo(0);
    expect(bottom.y).toBeCloseTo(10);
  });

  it("offsets from the centre", () => {
    const p = polarPoint(120, 120, 100, 180);
    expect(p.x).toBeCloseTo(20);
    expect(p.y).toBeCloseTo(120);
  });
});

describe("arcPath", () => {
  it("uses the small-arc flag under 180° of sweep", () => {
    expect(arcPath(0, 0, 10, 135, 200)).toContain("A 10 10 0 0 1");
  });

  it("uses the large-arc flag past 180° of sweep", () => {
    expect(arcPath(0, 0, 10, 135, 405)).toContain("A 10 10 0 1 1");
  });

  it("starts at the start angle's point", () => {
    const start = polarPoint(120, 120, 100, 135);
    expect(arcPath(120, 120, 100, 135, 405)).toMatch(
      new RegExp(`^M ${start.x} ${start.y} `),
    );
  });
});
