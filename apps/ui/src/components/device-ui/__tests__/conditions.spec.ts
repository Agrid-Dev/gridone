import { describe, expect, it } from "vitest";
import {
  CONDITION_MAX_DEPTH,
  EvaluationBudget,
  evaluateCondition,
  isBlocked,
  isVisible,
  type Condition,
  type Scalar,
} from "../conditions";

const values: Record<string, Scalar | null> = {
  power: true,
  mode: "heat",
  fan: 2,
  humidity: null,
};
const resolve = (binding: string) => values[binding];

describe("evaluateCondition", () => {
  it.each<[string, Condition, string]>([
    ["eq true", { op: "eq", binding: "power", value: true }, "true"],
    ["eq false", { op: "eq", binding: "mode", value: "cool" }, "false"],
    // No coercion: the string "2" is not the number 2.
    ["eq strict type", { op: "eq", binding: "fan", value: "2" }, "false"],
    [
      "eq unknown value",
      { op: "eq", binding: "humidity", value: 44 },
      "unknown",
    ],
    ["eq missing binding", { op: "eq", binding: "nope", value: 1 }, "unknown"],
    [
      "in true",
      { op: "in", binding: "mode", values: ["heat", "cool"] },
      "true",
    ],
    ["in false", { op: "in", binding: "fan", values: [1, 3] }, "false"],
    ["in unknown", { op: "in", binding: "humidity", values: [44] }, "unknown"],
    ["is_known true", { op: "is_known", binding: "fan" }, "true"],
    ["is_known false (null)", { op: "is_known", binding: "humidity" }, "false"],
    ["is_known false (missing)", { op: "is_known", binding: "nope" }, "false"],
    [
      "not true",
      { op: "not", condition: { op: "eq", binding: "power", value: false } },
      "true",
    ],
    [
      "not unknown",
      { op: "not", condition: { op: "is_known", binding: "humidity" } },
      "true",
    ],
    [
      "not propagates unknown",
      { op: "not", condition: { op: "eq", binding: "humidity", value: 1 } },
      "unknown",
    ],
    [
      "all true",
      {
        op: "all",
        conditions: [
          { op: "eq", binding: "power", value: true },
          { op: "eq", binding: "mode", value: "heat" },
        ],
      },
      "true",
    ],
    [
      "all false wins over unknown",
      {
        op: "all",
        conditions: [
          { op: "eq", binding: "humidity", value: 1 },
          { op: "eq", binding: "mode", value: "cool" },
        ],
      },
      "false",
    ],
    [
      "all unknown when nothing false",
      {
        op: "all",
        conditions: [
          { op: "eq", binding: "power", value: true },
          { op: "eq", binding: "humidity", value: 1 },
        ],
      },
      "unknown",
    ],
    ["all of nothing", { op: "all", conditions: [] }, "true"],
    [
      "any true wins over unknown",
      {
        op: "any",
        conditions: [
          { op: "eq", binding: "humidity", value: 1 },
          { op: "eq", binding: "power", value: true },
        ],
      },
      "true",
    ],
    [
      "any unknown when nothing true",
      {
        op: "any",
        conditions: [
          { op: "eq", binding: "mode", value: "cool" },
          { op: "eq", binding: "humidity", value: 1 },
        ],
      },
      "unknown",
    ],
    ["any of nothing", { op: "any", conditions: [] }, "false"],
  ])("%s", (_label, condition, expected) => {
    expect(evaluateCondition(condition, resolve)).toBe(expected);
  });

  it("degrades to unknown beyond the depth limit and reports it", () => {
    let condition: Condition = { op: "eq", binding: "power", value: true };
    for (let i = 0; i < CONDITION_MAX_DEPTH; i += 1) {
      condition = { op: "not", condition };
    }
    // CONDITION_MAX_DEPTH `not`s plus the leaf exceed the limit by one level.
    const budget = new EvaluationBudget();
    expect(evaluateCondition(condition, resolve, budget)).toBe("unknown");
    expect(budget.exceeded).toBe(true);
  });

  it("evaluates exactly at the depth limit", () => {
    let condition: Condition = { op: "eq", binding: "power", value: true };
    for (let i = 0; i < CONDITION_MAX_DEPTH - 1; i += 1) {
      condition = { op: "not", condition };
    }
    const budget = new EvaluationBudget();
    // Seven `not`s flip the leaf's `true` an odd number of times.
    expect(evaluateCondition(condition, resolve, budget)).toBe("false");
    expect(budget.exceeded).toBe(false);
  });

  it("degrades to unknown once the operation budget is spent", () => {
    const wide: Condition = {
      op: "all",
      conditions: Array.from({ length: 20 }, () => ({
        op: "eq" as const,
        binding: "power",
        value: true,
      })),
    };
    const budget = new EvaluationBudget(10);
    expect(evaluateCondition(wide, resolve, budget)).toBe("unknown");
    expect(budget.exceeded).toBe(true);
    expect(budget.operations).toBe(11);
  });

  it("shares the budget across evaluations of one render", () => {
    const budget = new EvaluationBudget(3);
    const leaf: Condition = { op: "eq", binding: "power", value: true };
    expect(evaluateCondition(leaf, resolve, budget)).toBe("true");
    expect(evaluateCondition(leaf, resolve, budget)).toBe("true");
    expect(evaluateCondition(leaf, resolve, budget)).toBe("true");
    expect(evaluateCondition(leaf, resolve, budget)).toBe("unknown");
  });
});

describe("isVisible / isBlocked", () => {
  it.each<[string | undefined, boolean, boolean]>([
    [undefined, true, false],
    ["true", true, true],
    ["false", false, false],
    ["unknown", false, true],
  ])("verdict %s → visible %s, blocked %s", (verdict, visible, blocked) => {
    expect(isVisible(verdict as never)).toBe(visible);
    expect(isBlocked(verdict as never)).toBe(blocked);
  });
});
