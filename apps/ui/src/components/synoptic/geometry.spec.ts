import { describe, expect, it } from "vitest";
import { arrowHead, fraction, roundedPath, unit } from "./geometry";

describe("roundedPath", () => {
  it("is empty below two points", () => {
    expect(roundedPath([], 10)).toBe("");
    expect(roundedPath([{ x: 1, y: 2 }], 10)).toBe("");
  });

  it("draws a straight segment between two points", () => {
    expect(
      roundedPath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        10,
      ),
    ).toBe("M 0 0 L 10 0");
  });

  it("rounds a corner with a quadratic curve through the waypoint", () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      10,
    );
    expect(d).toBe("M 0 0 L 90 0 Q 100 0 100 10 L 100 100");
  });

  it("clamps the radius to half of the shortest adjacent segment", () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 100 },
      ],
      30,
    );
    expect(d).toBe("M 0 0 L 5 0 Q 10 0 10 5 L 10 100");
  });

  it("skips a corner sitting on a zero-length segment", () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      10,
    );
    expect(d).toBe("M 0 0 L 10 0");
  });
});

describe("unit", () => {
  it("normalises the direction a to b", () => {
    expect(unit({ x: 0, y: 0 }, { x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
  });

  it("returns the zero vector for coincident points", () => {
    expect(unit({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 0, y: 0 });
  });
});

describe("arrowHead", () => {
  it("puts the tip exactly at the given point and the base behind it", () => {
    const points = arrowHead({ x: 100, y: 50 }, { x: 1, y: 0 }, 10, 6);
    expect(points).toBe("100,50 90,53 90,47");
  });
});

describe("fraction", () => {
  it("clamps to the unit interval", () => {
    expect(fraction(50, 0, 100)).toBe(0.5);
    expect(fraction(-5, 0, 100)).toBe(0);
    expect(fraction(500, 0, 100)).toBe(1);
  });

  it("is zero on an empty or reversed range", () => {
    expect(fraction(3, 3, 3)).toBe(0);
    expect(fraction(3, 10, 0)).toBe(0);
  });
});
