import type { Condition } from "./conditions";
import type { PresentationV1 } from "./document";
import type { ControlSpec } from "./runtime";

/**
 * The runtime's control specs of a document: each declared control bound
 * to the attribute its binding names, its conditions rebound the same way so
 * a runtime judges them over attribute values without the document.
 * Controls whose binding is unknown are dropped (the server refuses such
 * documents; a stale one must not reach a device attribute by accident).
 */
export function controlSpecsOf(
  document: PresentationV1,
): Record<string, ControlSpec> {
  const attributeOf = (binding: string) =>
    document.bindings[binding]?.attribute;
  const specs: Record<string, ControlSpec> = {};
  for (const [id, control] of Object.entries(document.controls)) {
    const attribute = attributeOf(control.binding);
    if (!attribute) continue;
    specs[id] = {
      kind: control.kind,
      attribute,
      label: control.label,
      visibleWhen:
        control.visible_when &&
        bindCondition(control.visible_when, attributeOf),
      blockedWhen:
        control.blocked_when &&
        bindCondition(control.blocked_when, attributeOf),
    };
  }
  return specs;
}

/**
 * The same condition over attribute names instead of binding ids. A binding
 * the document does not declare keeps its id, which no attribute matches, so
 * it stays unknown rather than resolving by accident.
 */
export function bindCondition(
  condition: Condition,
  attributeOf: (binding: string) => string | undefined,
): Condition {
  switch (condition.op) {
    case "eq":
    case "in":
    case "is_known":
      return {
        ...condition,
        binding: attributeOf(condition.binding) ?? condition.binding,
      };
    case "not":
      return {
        op: "not",
        condition: bindCondition(condition.condition, attributeOf),
      };
    case "all":
      return {
        op: "all",
        conditions: condition.conditions.map((child) =>
          bindCondition(child, attributeOf),
        ),
      };
    case "any":
      return {
        op: "any",
        conditions: condition.conditions.map((child) =>
          bindCondition(child, attributeOf),
        ),
      };
  }
}
