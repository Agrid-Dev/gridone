import type { Severity } from "@gridone/sdk";
import {
  SEMANTIC_BG_CLASS,
  SEMANTIC_HOVER_TEXT_CLASS,
  SEMANTIC_TEXT_CLASS,
  SEVERITY_LEVEL,
} from "@/lib/semanticColors";

export type { Severity };

/** Every severity, mildest first — e.g. for building filter options. */
export const SEVERITIES = [
  "info",
  "warning",
  "alert",
] as const satisfies readonly Severity[];

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

/** Maps each severity's class table off the shared semantic status level. */
function bySeverity(table: Record<string, string>): Record<Severity, string> {
  return {
    alert: table[SEVERITY_LEVEL.alert],
    warning: table[SEVERITY_LEVEL.warning],
    info: table[SEVERITY_LEVEL.info],
  };
}

/** Foreground color per severity (icons, text). */
export const SEVERITY_TEXT_CLASS = bySeverity(SEMANTIC_TEXT_CLASS);

/** Group-hover foreground color per severity. */
export const SEVERITY_HOVER_TEXT_CLASS = bySeverity(SEMANTIC_HOVER_TEXT_CLASS);

/** Solid fill per severity (dots, indicators). */
export const SEVERITY_DOT_CLASS = bySeverity(SEMANTIC_BG_CLASS);
