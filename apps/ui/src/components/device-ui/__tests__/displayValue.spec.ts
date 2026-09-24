import { describe, expect, it } from "vitest";
import { displayValue } from "../displayValue";
import type { PresentationV1 } from "../document";

const document: PresentationV1 = {
  schema_version: 1,
  requires: ["display-transforms/1"],
  assets: {},
  controls: {},
  bindings: {
    canonical: { attribute: "temperature" },
    converted: {
      attribute: "temperature",
      display_transform: {
        scale: 1.8,
        offset: 32,
        when: { op: "eq", binding: "unit", value: "F" },
      },
    },
    unit: { attribute: "unit" },
  },
  page: { kind: "attributes" },
};

describe("display conversion", () => {
  it.each([
    [20, 68],
    [-40, -40],
    [20.5, 68.9],
  ])(
    "converts %s canonical degrees to %s for display only",
    (value, expected) => {
      expect(displayValue("converted", document, value, () => "F")).toBeCloseTo(
        expected,
      );
      expect(displayValue("canonical", document, value, () => "F")).toBe(value);
      expect(displayValue("converted", document, value, () => "C")).toBe(value);
    },
  );
  it("keeps unknown values and unknown unit unavailable", () => {
    expect(displayValue("converted", document, 20, () => null)).toBeNull();
    expect(displayValue("converted", document, null, () => "F")).toBeNull();
    expect(displayValue("converted", document, Infinity, () => "F")).toBeNull();
  });
});
