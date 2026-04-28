export type Severity = "alert" | "warning" | "info";
export const SEVERITIES = [
  "info",
  "warning",
  "alert",
] as const satisfies readonly Severity[];
