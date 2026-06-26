import type { Severity } from "@/api/severity";

/**
 * Semantic status levels shared across attribute values, fault severities and
 * connection status, so colours are defined once.
 *
 * This is the inline-text-colour slice only; full colour mutualisation across
 * badges and charts is tracked in AGR-854.
 */
export type StatusLevel = "ok" | "info" | "warning" | "error";

/** Inline text colour per semantic level. */
export const STATUS_TEXT_COLOR: Record<StatusLevel, string> = {
  ok: "text-green-600",
  info: "text-sky-600",
  warning: "text-amber-600",
  error: "text-red-600",
};

/** Fault severity mapped onto a semantic level. */
export const SEVERITY_LEVEL: Record<Severity, StatusLevel> = {
  alert: "error",
  warning: "warning",
  info: "info",
};
