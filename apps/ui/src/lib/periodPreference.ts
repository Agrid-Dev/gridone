import { type TimeRangePreset, isTimeRangePreset } from "./timeRange";

/**
 * The period a user last picked on a view, remembered across visits.
 *
 * Only presets are stored. A preset is relative — "the last month" means the
 * same thing whenever it is restored — whereas an absolute range restored days
 * later would reopen on a frozen window of the past, which reads as broken
 * data rather than as a remembered preference.
 *
 * Storage can be unavailable (private browsing, a disabled quota), and its
 * contents are user-writable, so reads validate and every access is guarded:
 * losing the preference is never a reason to fail a render.
 */

export function readStoredPreset(key: string): TimeRangePreset | null {
  try {
    const stored = window.localStorage.getItem(key);
    return stored && isTimeRangePreset(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredPreset(key: string, preset: TimeRangePreset): void {
  try {
    window.localStorage.setItem(key, preset);
  } catch {
    // Preference is a convenience; a full or disabled store is not an error.
  }
}
