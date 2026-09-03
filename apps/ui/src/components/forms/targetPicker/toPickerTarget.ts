import type { AttributeTarget } from "./AttributeTargetPicker";

/** The picker needs a well-formed target to render; the schema-driven default
 *  for an object property is `""`, which is what a new widget starts from. */
export function toPickerTarget(value: unknown): AttributeTarget {
  if (typeof value !== "object" || value === null) return { devices: {} };
  const { devices, attribute } = value as Partial<AttributeTarget>;
  return { devices: devices ?? {}, attribute };
}
