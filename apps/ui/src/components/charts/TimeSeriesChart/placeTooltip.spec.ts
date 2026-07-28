import { describe, it, expect } from "vitest";
import { TOOLTIP_OFFSET } from "./constants";
import { placeTooltip } from "./placeTooltip";

const EXTENT = 1000;

describe("placeTooltip", () => {
  it("sits after the cursor when there is room", () => {
    expect(placeTooltip(100, 200, EXTENT)).toBe(100 + TOOLTIP_OFFSET);
  });

  it("flips before the cursor when it would overhang the far edge", () => {
    expect(placeTooltip(900, 200, EXTENT)).toBe(900 - TOOLTIP_OFFSET - 200);
  });

  // The regression: a long series label makes the box too wide to fit before
  // the cursor, so flipping it there overhangs the near edge — and a dashboard
  // tile hides overflow, so the excess is cut off rather than merely untidy.
  it("holds a box too wide to flip at the near edge", () => {
    expect(placeTooltip(400, 600, EXTENT)).toBe(0);
  });

  // The property that matters, over the placements a cursor can produce.
  it.each([100, 400, 700, 900, 1000])(
    "keeps a wide box within the chart at cursor %i",
    (cursor) => {
      const size = 600;
      const left = placeTooltip(cursor, size, EXTENT);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + size).toBeLessThanOrEqual(EXTENT);
    },
  );

  it("pins to the near edge when the box cannot fit at all", () => {
    expect(placeTooltip(500, 1200, EXTENT)).toBe(0);
  });

  // Height is unknown until the container is measured; an unbounded extent
  // must not push the box off the near edge.
  it("falls back to the offset position when the extent is unknown", () => {
    expect(placeTooltip(100, 200, Infinity)).toBe(100 + TOOLTIP_OFFSET);
  });
});
