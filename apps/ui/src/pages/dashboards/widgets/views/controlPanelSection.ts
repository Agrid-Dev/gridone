import type { ActiveCondition } from "@gridone/sdk";

/** Whether a section's condition holds, or cannot be told. */
export type SectionActivity = "active" | "inactive" | "unknown";

/**
 * Judge a section's `active_when` against the reading of its attribute.
 *
 * A section with no condition is always active. One whose attribute has no
 * boolean reading — device still loading, deleted, attribute gone, no value
 * reported yet — is `unknown` rather than active: its controls stay disabled
 * until the condition is actually seen to hold.
 */
export function sectionActivity(
  condition: ActiveCondition | null | undefined,
  reading: unknown,
): SectionActivity {
  if (!condition) return "active";
  if (typeof reading !== "boolean") return "unknown";
  return reading === (condition.value ?? true) ? "active" : "inactive";
}
