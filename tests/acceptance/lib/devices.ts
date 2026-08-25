import type { AttributeValueType, Device } from "@gridone/sdk";

/**
 * Reads one attribute's live value off a device snapshot.
 *
 * The generated wire type keeps attribute payloads open
 * (`Attribute: { [key: string]: unknown }`), so the narrowing happens here once
 * instead of at every call site. An attribute the driver has not read yet — or
 * does not declare — reads as `null`, which is what lets a suite poll for "a
 * value has arrived at all". Callers wanting a narrower type (a status enum,
 * say) cast the result.
 */
export function currentValue(
  device: Device,
  attribute: string,
): AttributeValueType | null {
  const attr = device.attributes?.[attribute] as
    | { current_value?: AttributeValueType | null }
    | undefined;
  return attr?.current_value ?? null;
}
