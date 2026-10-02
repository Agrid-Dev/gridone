import type {
  ActiveCondition,
  ControlPanelSection,
  ResolvedOption,
  WriteReason,
} from "@gridone/sdk";

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

/**
 * Why a boolean cannot be toggled from the value it shows, per the driver's
 * write rules — or `null` when nothing stops it.
 *
 * The server resolves those rules for each value an attribute can take and
 * ships the outcome as the attribute's write options, so nothing is evaluated
 * here: the toggle's target is the opposite of the displayed value, and its
 * option says whether it is available and why not. A rule only ever blocks
 * one direction this way — a pump refused its start can still be stopped.
 */
export function blockedToggleReasons(
  options: readonly ResolvedOption[] | null | undefined,
  displayed: unknown,
): WriteReason[] | null {
  if (typeof displayed !== "boolean") return null;
  const target = options?.find((option) => option.value === !displayed);
  return target?.available === false ? (target.reasons ?? []) : null;
}

/** The device every row of a section links to, or `null` when the rows do not
 *  all link to one device: its title then links there too. */
export function sectionDevice(section: ControlPanelSection): string | null {
  const ids = new Set(
    (section.attributes ?? []).map((item) => (item.link ? item.device_id : "")),
  );
  const [id] = ids;
  return ids.size === 1 && id ? id : null;
}
