import type { Scalar } from "../conditions";
import type { ControlKind } from "../document";
import type { FaceAction, LocalizedText } from "../face";

/**
 * Control semantics of a presentation: what a `toggle`, `number` or
 * `select` control may do with its attribute, derived from the attribute's
 * own contract (`write_constraints`, `value_options`) and never from the
 * document. A step or bound the device has not reported yet makes the
 * corresponding action unavailable — the UI never widens what is allowed.
 */

export type { ControlKind } from "../document";

export type ControlSpec = {
  kind: ControlKind;
  /** Attribute of the current device the control is bound to. */
  attribute: string;
  label: LocalizedText;
};

/** A bound given as a constant or as a sibling attribute reference. */
export type Bound = number | { attribute: string };

export type WriteConstraints = {
  step?: Bound | null;
  minimum?: Bound | null;
  maximum?: Bound | null;
};

/** The slice of a device attribute the runtime and the widgets read. */
export type AttributeLike = {
  name: string;
  data_type: string;
  read_write_modes: readonly string[];
  current_value: Scalar | null;
  value_options?: readonly Scalar[];
  write_constraints?: WriteConstraints | null;
  label?: LocalizedText | null;
  description?: LocalizedText | null;
  group?: string | null;
  unit?: string | null;
};

export type ResolvedConstraints = {
  step: number | null;
  minimum: number | null;
  maximum: number | null;
  /** A declared reference could not be resolved to a number. */
  unknown: boolean;
};

export type ValueResolver = (attribute: string) => Scalar | null | undefined;

const GRID_EPSILON = 1e-9;

function resolveBound(
  bound: Bound | null | undefined,
  resolve: ValueResolver,
): { value: number | null; unknown: boolean } {
  if (bound === null || bound === undefined)
    return { value: null, unknown: false };
  if (typeof bound === "number") return { value: bound, unknown: false };
  const value = resolve(bound.attribute);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { value: null, unknown: true };
  }
  return { value, unknown: false };
}

export function resolveConstraints(
  constraints: WriteConstraints | null | undefined,
  resolve: ValueResolver,
): ResolvedConstraints {
  const step = resolveBound(constraints?.step, resolve);
  const minimum = resolveBound(constraints?.minimum, resolve);
  const maximum = resolveBound(constraints?.maximum, resolve);
  return {
    step: step.value !== null && step.value > 0 ? step.value : null,
    minimum: minimum.value,
    maximum: maximum.value,
    unknown:
      step.unknown ||
      minimum.unknown ||
      maximum.unknown ||
      (step.value !== null && step.value <= 0),
  };
}

export function isWritable(attribute: AttributeLike): boolean {
  return attribute.read_write_modes.includes("write");
}

/**
 * Value a face action or a stepper would write, or null when the action is
 * unavailable: unknown current value, unknown step or bound, a bound
 * reached, an option list without the current value, or a kind mismatch.
 * Numbers are snapped to the step grid (anchored at 0) so a device value
 * off the grid still steps onto it. Example: 21.3 with step 0.5 increments
 * to 21.5, decrements to 21.0.
 */
export function nextValue(
  op: FaceAction["op"],
  spec: ControlSpec,
  attribute: AttributeLike,
  current: Scalar | null,
  constraints: ResolvedConstraints,
): Scalar | null {
  if (spec.kind === "toggle") {
    if (op !== "toggle" || typeof current !== "boolean") return null;
    return !current;
  }
  if (spec.kind === "select") {
    if (op !== "cycle") return null;
    const options = attribute.value_options ?? [];
    if (options.length === 0 || current === null) return null;
    const index = options.indexOf(current);
    if (index === -1) return null;
    return options[(index + 1) % options.length];
  }
  if (op !== "increment" && op !== "decrement") return null;
  if (typeof current !== "number" || constraints.unknown) return null;
  const step = constraints.step;
  if (step === null) return null;
  // Next grid point strictly above (or below) the current value, so a value
  // off the grid steps onto it; the epsilon absorbs floating-point noise on
  // values already on the grid (21 / 0.5 must count as exactly 42).
  const quotient = current / step;
  const index =
    op === "increment"
      ? Math.floor(quotient + GRID_EPSILON) + 1
      : Math.ceil(quotient - GRID_EPSILON) - 1;
  const candidate = round(index * step, step);
  if (constraints.maximum !== null && candidate > constraints.maximum)
    return null;
  if (constraints.minimum !== null && candidate < constraints.minimum)
    return null;
  return candidate;
}

/** Round to the step's decimals, so 21 + 0.1 + 0.1 shows as 21.2. */
function round(value: number, step: number): number {
  return Number(value.toFixed(Math.min(100, decimalsOf(step))));
}

/** Decimal places of a step, including exponent notation: 0.25 → 2, 2.5e-7 → 8. */
export function decimalsOf(step: number): number {
  const [coefficient, exponent = "0"] = step.toString().split("e");
  const fraction = coefficient.split(".")[1] ?? "";
  return Math.max(0, fraction.length - Number(exponent));
}
