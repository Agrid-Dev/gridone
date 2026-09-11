import { fmt } from "@/lib/formatValue";

export { fmt };

/** "23.1° · 82" — pressure omitted when the field is absent. */
export function airLine(
  temperature: number | null | undefined,
  pressure: number | null | undefined,
): string {
  const parts = [fmt(temperature, 1, "°")];
  if (pressure != null) parts.push(fmt(pressure));
  return parts.join(" · ");
}
