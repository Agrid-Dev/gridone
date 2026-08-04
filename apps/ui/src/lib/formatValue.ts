export type CellValue = string | number | boolean | null | undefined;

/** No physical units yet — devices don't declare them, so we can't assume
 *  any. Temperatures get a scale-agnostic `°` like the other standard
 *  device views; `%` stays because it is a ratio, not a physical unit. */
export function fmt(
  value: number | null | undefined,
  digits = 0,
  suffix = "",
): string {
  if (value == null) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

export function formatValue(value: CellValue, dataType?: string): string {
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (dataType === "float" && typeof value === "number")
    return value.toFixed(2);
  return String(value);
}
