/**
 * The auto-refresh cadence a user last picked on the history page,
 * remembered across visits and devices (a viewing habit, not a per-device
 * setting).
 *
 * Same contract as `lib/periodPreference`: storage can be unavailable and its
 * contents are user-writable, so reads validate against the allowed set and
 * every access is guarded — losing the preference never fails a render.
 */

/** Auto-refresh cadences offered by the control, in milliseconds. 0 = off. */
export const REFRESH_INTERVALS = [0, 10_000, 60_000, 300_000] as const;

export type RefreshInterval = (typeof REFRESH_INTERVALS)[number];

const STORAGE_KEY = "device-history-refresh";

function isRefreshInterval(value: number): value is RefreshInterval {
  return (REFRESH_INTERVALS as readonly number[]).includes(value);
}

export function readStoredRefreshInterval(): RefreshInterval {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 0;
    const stored = Number(raw);
    return isRefreshInterval(stored) ? stored : 0;
  } catch {
    return 0;
  }
}

export function writeStoredRefreshInterval(interval: RefreshInterval): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(interval));
  } catch {
    // Preference is a convenience; a full or disabled store is not an error.
  }
}
