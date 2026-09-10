import { describe, expect, it } from "vitest";
import {
  isWritable,
  nextValue,
  resolveConstraints,
  type AttributeLike,
  type ControlSpec,
} from "../controls";

const number: ControlSpec = {
  kind: "number",
  attribute: "setpoint",
  label: { default: "Setpoint" },
};
const toggle: ControlSpec = {
  kind: "toggle",
  attribute: "power",
  label: { default: "Power" },
};
const select: ControlSpec = {
  kind: "select",
  attribute: "fan",
  label: { default: "Fan" },
};

const attribute = (overrides: Partial<AttributeLike> = {}): AttributeLike => ({
  name: "setpoint",
  data_type: "float",
  read_write_modes: ["read", "write"],
  current_value: 21,
  ...overrides,
});

const siblings = (values: Record<string, number | null>) => (name: string) =>
  values[name];

describe("resolveConstraints", () => {
  it("resolves constants and sibling references", () => {
    expect(
      resolveConstraints(
        {
          step: { attribute: "precision" },
          minimum: 16,
          maximum: { attribute: "max" },
        },
        siblings({ precision: 0.5, max: 30 }),
      ),
    ).toEqual({ step: 0.5, minimum: 16, maximum: 30, unknown: false });
  });

  it.each([
    ["unknown step reference", { step: { attribute: "precision" } }, {}],
    [
      "unknown bound reference",
      { minimum: { attribute: "min" } },
      { min: null },
    ],
    ["non-positive step", { step: 0 }, {}],
  ])("flags %s as unknown", (_label, constraints, values) => {
    expect(resolveConstraints(constraints, siblings(values)).unknown).toBe(
      true,
    );
  });

  it("is empty without constraints", () => {
    expect(resolveConstraints(null, siblings({}))).toEqual({
      step: null,
      minimum: null,
      maximum: null,
      unknown: false,
    });
  });
});

describe("nextValue", () => {
  const known = { step: 0.5, minimum: 16, maximum: 22, unknown: false };

  it.each<[string, "increment" | "decrement", number, number | null]>([
    ["steps up on the grid", "increment", 21, 21.5],
    ["steps down on the grid", "decrement", 21, 20.5],
    ["snaps an off-grid value before stepping up", "increment", 21.3, 21.5],
    ["snaps an off-grid value before stepping down", "decrement", 21.3, 21],
    ["stops at the maximum", "increment", 22, null],
    ["stops at the minimum", "decrement", 16, null],
  ])("%s", (_label, op, current, expected) => {
    expect(nextValue(op, number, attribute(), current, known)).toBe(expected);
  });

  it("offers no increment without a known step", () => {
    const noStep = { ...known, step: null };
    expect(nextValue("increment", number, attribute(), 21, noStep)).toBeNull();
    const unknown = { ...known, unknown: true };
    expect(nextValue("increment", number, attribute(), 21, unknown)).toBeNull();
  });

  it.each([
    [0.1, 21.1, 21.2, 21],
    [0.25, 21, 21.25, 20.75],
    [2.5, 20, 22.5, 17.5],
    [1.25, 20, 21.25, 18.75],
    [2.5e-7, 1e-6, 1.25e-6, 7.5e-7],
  ])(
    "preserves the step grid with step %s",
    (step, current, increment, decrement) => {
      const constraints = {
        step,
        minimum: null,
        maximum: null,
        unknown: false,
      };
      expect(
        nextValue("increment", number, attribute(), current, constraints),
      ).toBe(increment);
      expect(
        nextValue("decrement", number, attribute(), current, constraints),
      ).toBe(decrement);
    },
  );

  it("refuses a kind mismatch or an unknown current value", () => {
    expect(nextValue("toggle", number, attribute(), 21, known)).toBeNull();
    expect(nextValue("increment", number, attribute(), null, known)).toBeNull();
    expect(nextValue("increment", toggle, attribute(), true, known)).toBeNull();
  });

  it("toggles a boolean", () => {
    const power = attribute({
      name: "power",
      data_type: "bool",
      current_value: true,
    });
    expect(nextValue("toggle", toggle, power, true, known)).toBe(false);
    expect(nextValue("toggle", toggle, power, null, known)).toBeNull();
  });

  it("cycles through the attribute's options and wraps around", () => {
    const fan = attribute({
      name: "fan",
      data_type: "string",
      current_value: "high",
      value_options: ["low", "medium", "high"],
    });
    expect(nextValue("cycle", select, fan, "high", known)).toBe("low");
    expect(nextValue("cycle", select, fan, "medium", known)).toBe("high");
    expect(nextValue("cycle", select, fan, "turbo", known)).toBeNull();
    expect(
      nextValue("cycle", select, attribute({ value_options: [] }), "a", known),
    ).toBeNull();
  });
});

describe("isWritable", () => {
  it("reads the attribute's modes", () => {
    expect(isWritable(attribute())).toBe(true);
    expect(isWritable(attribute({ read_write_modes: ["read"] }))).toBe(false);
  });
});
