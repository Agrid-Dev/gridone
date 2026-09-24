import { evaluateCondition, type Scalar } from "./conditions";
import type { PresentationV1 } from "./document";

/** Convert only the displayed scalar; conditions and writes use canonical values. */
export function displayValue(
  binding: string,
  document: PresentationV1,
  value: Scalar | null,
  canonical: (binding: string) => Scalar | null,
): Scalar | null {
  const transform = document.bindings[binding]?.display_transform;
  if (!transform) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (transform.when) {
    const condition = evaluateCondition(transform.when, canonical);
    if (condition === "unknown") return null;
    if (condition === "false") return value;
  }
  const converted = value * (transform.scale ?? 1) + (transform.offset ?? 0);
  return Number.isFinite(converted) ? converted : null;
}
