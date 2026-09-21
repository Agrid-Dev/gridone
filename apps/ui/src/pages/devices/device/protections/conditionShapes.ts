import type {
  DataType,
  DevicePointRef,
  WriteCondition,
  WriteExpression,
} from "@gridone/sdk";
import {
  defaultScalar,
  emptyPoint,
  isScalar,
  newCondition,
  sameScalarType,
  scalarType,
  pointType,
  type PointCatalog,
  type Scalar,
} from "./expressions";

/**
 * The comparisons a one-line row can express. They are the `WriteCondition`
 * operators that read as "<point> <comparison> <value>"; `all`, `any` and `not`
 * are structure rather than comparison and never appear here.
 */
export type Comparison = "eq" | "lt" | "lte" | "gt" | "gte" | "in" | "is_known";

export const comparisons: Comparison[] = [
  "eq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is_known",
];
const ordered: Comparison[] = ["lt", "lte", "gt", "gte"];

/** A comparison whose observed side is a plain device point. */
export type RowCondition = Extract<WriteCondition, { op: Comparison }>;
/** A group: `all` or `any` over a list of conditions. */
export type GroupCondition = Extract<WriteCondition, { op: "all" | "any" }>;
/** An "is one of" row, the only row that carries a list of values. */
export type MembershipRow = Extract<WriteCondition, { op: "in" }>;

export const isGroup = (value: WriteCondition): value is GroupCondition =>
  value.op === "all" || value.op === "any";

const isPoint = (value: WriteExpression): value is DevicePointRef =>
  typeof value === "object" &&
  value !== null &&
  "device_id" in value &&
  "attribute" in value;

/**
 * What a one-line row can show on its compared side: a fixed value, another
 * point, or the requested value. A calculation cannot be drawn on one line, and
 * a picker that cannot draw it would destroy it on the first click.
 */
function isSimpleRight(value: WriteExpression): boolean {
  if (isScalar(value) || isPoint(value)) return true;
  return typeof value === "object" && value !== null && "candidate" in value;
}

/**
 * Whether `value` fits a one-line row: a comparison whose observed side is a
 * device point and whose compared side the row can render. Anything else — a
 * calculation, a conditional value, an implicit point — keeps the expression
 * editor, on either side of the comparison.
 */
export function isRow(value: WriteCondition): value is RowCondition {
  if (value.op === "is_known" || value.op === "in") return isPoint(value.value);
  if ("left" in value) return isPoint(value.left) && isSimpleRight(value.right);
  return false;
}

/** The device point a row observes. */
export function rowPoint(row: RowCondition): DevicePointRef {
  return (
    row.op === "is_known" || row.op === "in" ? row.value : row.left
  ) as DevicePointRef;
}

/** What a row compares its point against, or undefined when it needs no value. */
export function rowValue(row: RowCondition): WriteExpression | undefined {
  return "right" in row ? row.right : undefined;
}

export type RightKind = "literal" | "point" | "candidate";

export function rightKind(value: WriteExpression): RightKind {
  if (isScalar(value)) return "literal";
  return "candidate" in value ? "candidate" : "point";
}

/** A row's observed type, from its point's declared data type. */
export function rowType(
  catalog: PointCatalog,
  row: RowCondition,
): DataType | undefined {
  return pointType(catalog, rowPoint(row));
}

const isNumeric = (type: DataType | undefined) =>
  !type || type === "int" || type === "float";

/**
 * The comparisons offered for `type`: ordering only makes sense on numbers, so
 * a boolean or text point offers equality and membership alone. The row's own
 * comparison always stays selectable so an existing rule never loses its shape.
 */
export function comparisonsFor(
  type: DataType | undefined,
  current: Comparison,
): Comparison[] {
  return comparisons.filter(
    (op) => isNumeric(type) || !ordered.includes(op) || op === current,
  );
}

/** Retype a scalar when the observed point's type no longer matches it. */
const retype = (value: Scalar, type: DataType | undefined): Scalar =>
  type && !sameScalarType(scalarType(value), type)
    ? defaultScalar(type)
    : value;

/** Replace a row's comparison, keeping its point and any compatible value. */
export function withComparison(
  row: RowCondition,
  next: Comparison,
  type: DataType | undefined,
): RowCondition {
  if (next === row.op) return row;
  const point = rowPoint(row);
  if (next === "is_known") return { op: next, value: point };
  if (next === "in")
    return { op: next, value: point, values: [defaultScalar(type)] };
  const right = rowValue(row);
  return {
    op: next,
    left: point,
    right:
      right === undefined
        ? defaultScalar(type)
        : isScalar(right)
          ? retype(right, type)
          : right,
  };
}

/**
 * Point a row at `next`, coercing every literal it holds to the new point's
 * type — a row switched from a boolean to a temperature must not keep `false`
 * as the value it compares against.
 */
export function withPoint(
  row: RowCondition,
  next: DevicePointRef,
  catalog: PointCatalog,
): RowCondition {
  const type = pointType(catalog, next);
  if (row.op === "is_known") return { op: row.op, value: next };
  if (row.op === "in") {
    // Retyping collapses distinct values onto the new type's default, so
    // `in [1, 2, 3]` moved to a boolean point must not become `[false, false,
    // false]` — three entries that all say the same thing.
    const values = [...new Set(row.values.map((value) => retype(value, type)))];
    return { op: row.op, value: next, values };
  }
  const ordering = ordered.includes(row.op);
  return {
    // An ordering comparison is meaningless on a boolean or text point.
    op: ordering && !isNumeric(type) ? "eq" : row.op,
    left: next,
    right: isScalar(row.right) ? retype(row.right, type) : row.right,
  };
}

/** Replace what a row compares against. */
export function withValue(
  row: RowCondition,
  value: WriteExpression,
): RowCondition {
  return "right" in row ? { ...row, right: value } : row;
}

/** Swap a row's compared side between a fixed value, a point and the candidate. */
export function withRightKind(
  row: RowCondition,
  kind: RightKind,
  type: DataType | undefined,
): RowCondition {
  if (!("right" in row) || rightKind(row.right) === kind) return row;
  return {
    ...row,
    right:
      kind === "point"
        ? emptyPoint()
        : kind === "candidate"
          ? { candidate: true }
          : defaultScalar(type),
  };
}

/**
 * The conditions the editor lists. A rule whose top level is not a group is
 * shown as a single row, without being rewritten: `withRows` puts it back
 * exactly as it was found unless the user adds a second condition.
 */
export function rowsOf(value: WriteCondition): WriteCondition[] {
  return isGroup(value) ? value.conditions : [value];
}

/** The `all` / `any` of a group, or undefined when the rule is a lone condition. */
export function groupOp(value: WriteCondition): "all" | "any" | undefined {
  return isGroup(value) ? value.op : undefined;
}

/**
 * Put an edited list of conditions back. A lone condition stays lone, so
 * editing a rule's metadata never changes the shape that was loaded; a second
 * condition wraps it into an `all`.
 */
export function withRows(
  value: WriteCondition,
  rows: WriteCondition[],
): WriteCondition {
  if (isGroup(value)) return { ...value, conditions: rows };
  return rows.length === 1 ? rows[0] : { op: "all", conditions: rows };
}

/** Switch a rule between "all of these" and "any of these". */
export function withGroupOp(
  value: WriteCondition,
  op: "all" | "any",
): WriteCondition {
  return isGroup(value) ? { ...value, op } : { op, conditions: [value] };
}

export const newRow = (): RowCondition => newCondition("eq") as RowCondition;
export const newGroup = (): GroupCondition => ({
  op: "any",
  conditions: [newRow()],
});
