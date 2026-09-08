import { describe, expect, it } from "vitest";
import { LABEL_MIN_PX, labelVisibleAtZoom } from "./PlanLabels";

describe("labelVisibleAtZoom", () => {
  it("shows a label once the room's narrow side reaches the pixel floor", () => {
    // Narrow side 4 m: visible from 14 px/m up (4 × 14 = 56 px).
    expect(labelVisibleAtZoom(6, 4, 14)).toBe(true);
    expect(labelVisibleAtZoom(6, 4, 13.9)).toBe(false);
  });

  it("gates on the narrow side regardless of orientation", () => {
    expect(labelVisibleAtZoom(4, 6, 14)).toBe(true);
    expect(labelVisibleAtZoom(40, 2, 14)).toBe(false);
  });

  it("honours the boundary exactly", () => {
    expect(labelVisibleAtZoom(1, 1, LABEL_MIN_PX)).toBe(true);
    expect(labelVisibleAtZoom(1, 1, LABEL_MIN_PX - 0.001)).toBe(false);
  });

  it("hides everything at zoom 0", () => {
    expect(labelVisibleAtZoom(100, 100, 0)).toBe(false);
  });
});
