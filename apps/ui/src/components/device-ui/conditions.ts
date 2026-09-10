/**
 * Bounded condition language of driver-defined presentations.
 *
 * A condition selects a finite outcome from attribute values (see the
 * device-presentation ADR, `docs/specs/driver-defined-device-ui.md` §4). It is
 * data, not code: six operators, no expressions, no path access. Evaluation is
 * three-valued — a binding whose value is not known yet yields `unknown`, and
 * `unknown` propagates through `not` / `all` / `any` (Kleene logic), so a
 * missing telemetry value can never make a control active by accident.
 *
 * The backend validates depth and operation counts before a document is
 * stored; the same limits are enforced here so a document that somehow
 * exceeds them degrades to `unknown` instead of pegging the renderer.
 */

export type Scalar = string | number | boolean;

export type Condition =
  | { op: "eq"; binding: string; value: Scalar }
  | { op: "in"; binding: string; values: Scalar[] }
  | { op: "is_known"; binding: string }
  | { op: "not"; condition: Condition }
  | { op: "all"; conditions: Condition[] }
  | { op: "any"; conditions: Condition[] };

export type Verdict = "true" | "false" | "unknown";

/** Value of a binding: `null` / `undefined` mean "not known". */
export type BindingResolver = (binding: string) => Scalar | null | undefined;

/** Maximum nesting of `not` / `all` / `any`, matching the backend budget. */
export const CONDITION_MAX_DEPTH = 8;
/** Maximum operator evaluations per `evaluateCondition` call. */
export const CONDITION_MAX_OPERATIONS = 1000;

/**
 * Operation counter shared by one evaluation. Exceeding the budget turns the
 * remaining sub-results into `unknown` and records it, so the renderer can
 * surface a diagnostic rather than silently rendering something.
 */
export class EvaluationBudget {
  operations = 0;
  exceeded = false;

  constructor(private readonly maxOperations = CONDITION_MAX_OPERATIONS) {}

  /** Consume one operation; false once the budget is spent. */
  consume(): boolean {
    if (this.exceeded) return false;
    this.operations += 1;
    if (this.operations > this.maxOperations) {
      this.exceeded = true;
      return false;
    }
    return true;
  }
}

export function evaluateCondition(
  condition: Condition,
  resolve: BindingResolver,
  budget: EvaluationBudget = new EvaluationBudget(),
): Verdict {
  return evaluate(condition, resolve, budget, 1);
}

function evaluate(
  condition: Condition,
  resolve: BindingResolver,
  budget: EvaluationBudget,
  depth: number,
): Verdict {
  if (depth > CONDITION_MAX_DEPTH || !budget.consume()) {
    budget.exceeded = true;
    return "unknown";
  }
  switch (condition.op) {
    case "is_known":
      return isKnown(resolve(condition.binding)) ? "true" : "false";
    case "eq": {
      const value = resolve(condition.binding);
      if (!isKnown(value)) return "unknown";
      return verdict(value === condition.value);
    }
    case "in": {
      const value = resolve(condition.binding);
      if (!isKnown(value)) return "unknown";
      return verdict(condition.values.includes(value));
    }
    case "not": {
      const inner = evaluate(condition.condition, resolve, budget, depth + 1);
      if (inner === "unknown") return "unknown";
      return inner === "true" ? "false" : "true";
    }
    case "all": {
      let sawUnknown = false;
      for (const child of condition.conditions) {
        const result = evaluate(child, resolve, budget, depth + 1);
        if (result === "false") return "false";
        if (result === "unknown") sawUnknown = true;
      }
      return sawUnknown ? "unknown" : "true";
    }
    case "any": {
      let sawUnknown = false;
      for (const child of condition.conditions) {
        const result = evaluate(child, resolve, budget, depth + 1);
        if (result === "true") return "true";
        if (result === "unknown") sawUnknown = true;
      }
      return sawUnknown ? "unknown" : "false";
    }
  }
}

function isKnown(value: Scalar | null | undefined): value is Scalar {
  return value !== null && value !== undefined;
}

function verdict(bool: boolean): Verdict {
  return bool ? "true" : "false";
}

/**
 * A layer or control is shown only when its `visible_when` is definitely
 * true: an unknown visibility never activates anything.
 */
export function isVisible(v: Verdict | undefined): boolean {
  return v === undefined || v === "true";
}

/**
 * A control is blocked unless its `blocked_when` is definitely false: an
 * unknown blocking condition disables it.
 */
export function isBlocked(v: Verdict | undefined): boolean {
  return v !== undefined && v !== "false";
}
