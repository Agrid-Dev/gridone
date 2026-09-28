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
