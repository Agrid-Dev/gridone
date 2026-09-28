/**
 * The attribute selection of the history views: which recorded attributes
 * the chart and the table show. It lives in the URL (`?attrs=a,b`) so a
 * copied link reproduces the view, and is remembered per device so the next
 * visit reopens on it.
 */

export const SELECTION_PARAM = "attrs";

/**
 * The selection a URL carries, kept to `available` in that order — a name
 * the device does not expose (unknown, or hidden by the current user's role)
 * is dropped, never shown. Null when the URL carries no usable selection:
 * the parameter is absent, or names nothing the device exposes. An explicit
 * empty parameter (`?attrs=`) is an empty selection.
 */
export function parseSelectionParam(
  param: string | null,
  available: readonly string[],
): string[] | null {
  if (param === null) return null;
  if (param === "") return [];
  const wanted = new Set(param.split(","));
  const selected = available.filter((name) => wanted.has(name));
  return selected.length > 0 ? selected : null;
}

export function serializeSelection(selected: readonly string[]): string {
  return selected.join(",");
}

/** `selected` in the canonical order of `available`, dropping the rest. */
export function canonicalSelection(
  selected: readonly string[],
  available: readonly string[],
): string[] {
  const wanted = new Set(selected);
  return available.filter((name) => wanted.has(name));
}

export function sameSelection(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

function storageKey(deviceId: string) {
  return `device-history-attrs:${deviceId}`;
}

/** The selection last applied on this device, or null when none is
 *  remembered or the store is unavailable. Contents are user-writable, so
 *  the shape is validated. */
export function readStoredSelection(deviceId: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey(deviceId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) &&
      parsed.every((name) => typeof name === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function writeStoredSelection(deviceId: string, selected: string[]) {
  try {
    localStorage.setItem(storageKey(deviceId), JSON.stringify(selected));
  } catch {
    // Preference is a convenience; a full or disabled store is not an error.
  }
}
