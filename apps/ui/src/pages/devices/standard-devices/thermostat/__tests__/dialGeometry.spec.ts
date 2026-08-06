import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETPOINT_RANGE,
  DIAL_START_DEG,
  DIAL_SWEEP_DEG,
  angleToFraction,
  arcPath,
  dialRange,
  pointAngle,
  pointToValue,
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

describe("pointAngle", () => {
  it("reads angles the same way polarPoint writes them", () => {
    const p = polarPoint(0, 0, 10, 135);
    expect(pointAngle(p.x, p.y)).toBeCloseTo(135);
  });
});

describe("angleToFraction", () => {
  it("maps the track ends and midpoint to 0, 0.5 and 1", () => {
    expect(angleToFraction(DIAL_START_DEG)).toBe(0);
    expect(angleToFraction(DIAL_START_DEG + DIAL_SWEEP_DEG / 2)).toBe(0.5);
    expect(angleToFraction(DIAL_START_DEG + DIAL_SWEEP_DEG)).toBe(1);
  });

  it("is insensitive to how the angle wraps around", () => {
    expect(angleToFraction(-90)).toBe(angleToFraction(270));
  });

  it.each([
    ["just past the max end", DIAL_START_DEG + DIAL_SWEEP_DEG + 20, 1],
    ["just before the min end", DIAL_START_DEG - 20, 0],
    ["bottom dead centre, max side", DIAL_START_DEG + DIAL_SWEEP_DEG + 44, 1],
    ["bottom dead centre, min side", DIAL_START_DEG + DIAL_SWEEP_DEG + 46, 0],
  ])("snaps to the nearer end in the gap (%s)", (_label, angle, expected) => {
    expect(angleToFraction(angle)).toBe(expected);
  });
});

describe("pointToValue", () => {
  /** Pointer offset from the centre for a value on the track. */
  const offsetFor = (value: number, min: number, max: number, r = 100) =>
    polarPoint(0, 0, r, valueToAngle(value, min, max));

  it("reads back the value the knob sits on", () => {
    const p = offsetFor(24, 16, 30);
    expect(pointToValue(p.x, p.y, 16, 30, 0.5)).toBe(24);
  });

  it("ignores the distance from the centre — only the angle counts", () => {
    const near = offsetFor(24, 16, 30, 30);
    const far = offsetFor(24, 16, 30, 400);
    expect(pointToValue(near.x, near.y, 16, 30, 0.5)).toBe(24);
    expect(pointToValue(far.x, far.y, 16, 30, 0.5)).toBe(24);
  });

  it("snaps to the step", () => {
    const p = offsetFor(24.2, 16, 30);
    expect(pointToValue(p.x, p.y, 16, 30, 0.5)).toBe(24);
  });

  it("keeps clean decimals on a step that is not binary-exact", () => {
    const p = offsetFor(20.3, 10, 30);
    expect(pointToValue(p.x, p.y, 10, 30, 0.1)).toBe(20.3);
  });

  it("reports a bound when the pointer wanders into the bottom gap", () => {
    // The gap straddles straight-down: its right half continues the max end
    // (bottom-right), its left half the min end (bottom-left).
    expect(pointToValue(1, 10, 16, 30, 0.5)).toBe(30);
    expect(pointToValue(-1, 10, 16, 30, 0.5)).toBe(16);
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
