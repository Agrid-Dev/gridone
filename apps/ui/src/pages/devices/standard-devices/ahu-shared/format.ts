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

/** "23.1° · 82" — pressure omitted when the field is absent. */
export function airLine(
  temperature: number | null | undefined,
  pressure: number | null | undefined,
): string {
  const parts = [fmt(temperature, 1, "°")];
  if (pressure != null) parts.push(fmt(pressure));
  return parts.join(" · ");
}
