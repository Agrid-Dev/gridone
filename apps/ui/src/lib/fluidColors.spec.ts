import { describe, expect, it } from "vitest";
import { FLUID_FILL_CLASS, FLUID_STROKE_CLASS } from "./fluidColors";

describe("fluid colour classes", () => {
  it("names the token after the fluid, underscores as hyphens", () => {
    for (const [fluid, cls] of Object.entries(FLUID_STROKE_CLASS)) {
      expect(cls).toBe(`stroke-fluid-${fluid.replaceAll("_", "-")}`);
    }
    for (const [fluid, cls] of Object.entries(FLUID_FILL_CLASS)) {
      expect(cls).toBe(`fill-fluid-${fluid.replaceAll("_", "-")}`);
    }
  });

  it("covers the same fluids for stroke and fill", () => {
    expect(Object.keys(FLUID_FILL_CLASS)).toEqual(
      Object.keys(FLUID_STROKE_CLASS),
    );
  });
});
