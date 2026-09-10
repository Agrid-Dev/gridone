import { describe, expect, it } from "vitest";
import { sliderRange } from "../controls";

describe("sliderRange", () => {
  it.each([
    [
      { minimum: 0.1, maximum: 1.1, step: 0.5 },
      { min: 0.5, max: 1, step: 0.5 },
    ],
    [
      { minimum: -1.1, maximum: -0.1, step: 0.5 },
      { min: -1, max: -0.5, step: 0.5 },
    ],
    [
      { minimum: 0.3, maximum: 0.6, step: 0.1 },
      { min: 0.3, max: 0.6, step: 0.1 },
    ],
    [{ minimum: 0, maximum: 10, step: null }, null],
    [{ minimum: 0, maximum: null, step: 1 }, null],
    [{ minimum: 0, maximum: Infinity, step: 1 }, null],
    [{ minimum: 0, maximum: 10, step: 0 }, null],
    [{ minimum: 0, maximum: 10, step: Infinity }, null],
    [{ minimum: 5, maximum: 1, step: 1 }, null],
    [{ minimum: 1, maximum: 1, step: 1 }, null],
    [{ minimum: 0.1, maximum: 0.3, step: 0.5 }, null],
    [{ minimum: 0, maximum: 1, step: 0.5, unknown: true }, null],
  ])("aligns or disables the range %j", (constraints, expected) => {
    expect(sliderRange({ unknown: false, ...constraints })).toEqual(expected);
  });
});
