import type { PresentationV1 } from "./document";
import type { ControlSpec } from "./runtime";

/**
 * The runtime's control specs of a document: each declared control bound
 * to the attribute its binding names. Controls whose binding is unknown
 * are dropped (the server refuses such documents; a stale one must not
 * reach a device attribute by accident).
 */
export function controlSpecsOf(
  document: PresentationV1,
): Record<string, ControlSpec> {
  const specs: Record<string, ControlSpec> = {};
  for (const [id, control] of Object.entries(document.controls)) {
    const attribute = document.bindings[control.binding]?.attribute;
    if (!attribute) continue;
    specs[id] = { kind: control.kind, attribute, label: control.label };
  }
  return specs;
}
