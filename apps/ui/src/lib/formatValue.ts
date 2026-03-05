export type CellValue = string | number | boolean | null | undefined;

export function formatValue(value: CellValue, dataType?: string): string {
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (dataType === "float" && typeof value === "number")
    return value.toFixed(2);
  return String(value);
}
