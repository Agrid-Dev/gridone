/**
 * The order the viewer arranged the chart's panels in, remembered per
 * device. Panel keys are the chart's (`float:<unit>`, or the attribute of a
 * boolean or text band); the chart itself tolerates keys it no longer has
 * and appends panels the order does not name.
 */

function storageKey(deviceId: string) {
  return `device-history-panels:${deviceId}`;
}

export function readStoredPanelOrder(deviceId: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey(deviceId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) &&
      parsed.every((key) => typeof key === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function writeStoredPanelOrder(deviceId: string, order: string[]) {
  try {
    localStorage.setItem(storageKey(deviceId), JSON.stringify(order));
  } catch {
    // Preference is a convenience; a full or disabled store is not an error.
  }
}

/**
 * A remembered order updated by a drop over the panels currently shown.
 *
 * `visible` is the new order of the panels on screen; a key remembered
 * from a panel not shown right now (its attribute deselected) keeps its
 * place, next to the shown neighbour it followed, so reselecting it lands
 * it where it was rather than last.
 */
export function mergePanelOrder(
  remembered: readonly string[],
  visible: readonly string[],
): string[] {
  const shown = new Set(visible);
  const result = [...visible];
  let after: string | null = null;
  for (const key of remembered) {
    if (shown.has(key)) {
      after = key;
      continue;
    }
    if (result.includes(key)) continue;
    const at = after === null ? 0 : result.indexOf(after) + 1;
    result.splice(at, 0, key);
    after = key;
  }
  return result;
}
