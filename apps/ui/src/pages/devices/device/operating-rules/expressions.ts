import type {
  DataType,
  Device,
  DeviceAttributeRef,
  OperatingRule,
  OperatingRuleDefinition,
  WriteCondition,
  WriteExpression,
} from "@gridone/sdk";

export type Scalar = OperatingRuleDefinition["target"]["value"];
export type AttributeCatalog = {
  devices: Device[];
  contracts?: OperatingRule["attributes"];
};
export type ExpressionKind =
  | "attribute"
  | "literal"
  | "candidate"
  | "add"
  | "subtract"
  | "min"
  | "max"
  | "if";
export type ConditionKind = WriteCondition["op"];

export const emptyAttribute = (): DeviceAttributeRef => ({
  device_id: "",
  attribute: "",
});
export const emptyCondition = (): WriteCondition => ({
  op: "eq",
  left: emptyAttribute(),
  right: false,
});
export const emptyDefinition = (): OperatingRuleDefinition => ({
  name: "",
  explanation: "",
  target: { ...emptyAttribute(), value: true },
  condition: emptyCondition(),
  max_age_seconds: null,
});
export function definitionOf(rule: OperatingRule): OperatingRuleDefinition {
  return {
    name: rule.name,
    explanation: rule.explanation,
    target: structuredClone(rule.target),
    condition: structuredClone(rule.condition),
    max_age_seconds: rule.max_age_seconds ?? null,
  };
}
export function catalogAttribute(
  catalog: AttributeCatalog,
  reference: DeviceAttributeRef,
) {
  return catalog.devices.find((d) => d.id === reference.device_id)
    ?.attributes?.[reference.attribute];
}
export function attributeType(
  catalog: AttributeCatalog,
  reference: DeviceAttributeRef,
): DataType | undefined {
  const type = catalogAttribute(catalog, reference)?.data_type;
  return (
    (typeof type === "string" ? (type as DataType) : undefined) ??
    catalog.contracts?.find(
      (p) =>
        p.device_id === reference.device_id &&
        p.attribute === reference.attribute,
    )?.data_type
  );
}
export function scalarType(value: Scalar): DataType {
  return typeof value === "boolean"
    ? "bool"
    : typeof value === "number"
      ? "float"
      : "str";
}
export function defaultScalar(type: DataType | undefined): Scalar {
  return type === "bool" ? false : type === "int" || type === "float" ? 0 : "";
}
export function isScalar(value: WriteExpression): value is Scalar {
  return typeof value !== "object";
}
export function expressionKind(value: WriteExpression): ExpressionKind {
  if (isScalar(value)) return "literal";
  if ("op" in value) return value.op;
  return "candidate" in value ? "candidate" : "attribute";
}
export function expressionType(
  value: WriteExpression,
  catalog: AttributeCatalog,
  candidateType?: DataType,
): DataType | undefined {
  if (isScalar(value)) return scalarType(value);
  if ("device_id" in value) return attributeType(catalog, value);
  if ("candidate" in value) return candidateType;
  if ("op" in value)
    return value.op === "if"
      ? expressionType(value.then, catalog, candidateType)
      : "float";
  return undefined;
}
export function newExpression(
  kind: ExpressionKind,
  type?: DataType,
): WriteExpression {
  if (kind === "attribute") return emptyAttribute();
  if (kind === "literal") return defaultScalar(type);
  if (kind === "candidate") return { candidate: true };
  if (kind === "if")
    return {
      op: "if",
      condition: emptyCondition(),
      then: defaultScalar(type),
      otherwise: defaultScalar(type),
    };
  return { op: kind, args: [0, 0] };
}
export function newCondition(op: ConditionKind): WriteCondition {
  if (op === "all" || op === "any")
    return { op, conditions: [emptyCondition(), emptyCondition()] };
  if (op === "not") return { op, condition: emptyCondition() };
  if (op === "is_known") return { op, value: emptyAttribute() };
  if (op === "in") return { op, value: emptyAttribute(), values: [false] };
  return { op, left: emptyAttribute(), right: op === "eq" ? false : 0 };
}
export function sameScalarType(
  a: DataType | undefined,
  b: DataType | undefined,
): boolean {
  const normalized = (v: DataType | undefined) => (v === "int" ? "float" : v);
  return normalized(a) === normalized(b);
}
