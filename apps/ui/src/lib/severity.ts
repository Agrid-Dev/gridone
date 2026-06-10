import type { Severity } from "@/api/severity";

/** Higher wins when picking the most severe of a set: alert > warning > info. */
const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  warning: 1,
  alert: 2,
};

/** The most severe of the given severities, or null when the list is empty. */
export function mostSevere(severities: Severity[]): Severity | null {
  return severities.reduce<Severity | null>(
    (max, s) =>
      max === null || SEVERITY_RANK[s] > SEVERITY_RANK[max] ? s : max,
    null,
  );
}

/** Foreground color per severity (icons, text). */
export const SEVERITY_TEXT_CLASS: Record<Severity, string> = {
  alert: "text-red-600",
  warning: "text-amber-500",
  info: "text-sky-500",
};

/** Group-hover foreground color per severity (full literal classes so Tailwind
 *  picks them up). */
export const SEVERITY_HOVER_TEXT_CLASS: Record<Severity, string> = {
  alert: "group-hover:text-red-600",
  warning: "group-hover:text-amber-500",
  info: "group-hover:text-sky-500",
};

/** Solid fill per severity (dots, indicators). */
export const SEVERITY_DOT_CLASS: Record<Severity, string> = {
  alert: "bg-red-600",
  warning: "bg-amber-500",
  info: "bg-sky-500",
};
