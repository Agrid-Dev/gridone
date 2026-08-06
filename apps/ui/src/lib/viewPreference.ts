/**
 * How a user last chose to look at a resource list — table or cards —
 * remembered across visits.
 *
 * Same guard rails as the period preference: storage can be unavailable
 * (private browsing, disabled quota) and its contents are user-writable, so
 * reads validate and every access is wrapped. Losing the preference falls back
 * to the caller's default; it is never a reason to fail a render.
 */

export type ResourceView = "table" | "grid";

export function isResourceView(
  value: string | null | undefined,
): value is ResourceView {
  return value === "table" || value === "grid";
}

export function readStoredView(key: string): ResourceView | null {
  try {
    const stored = window.localStorage.getItem(key);
    return isResourceView(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredView(key: string, view: ResourceView): void {
  try {
    window.localStorage.setItem(key, view);
  } catch {
    // Preference is a convenience; a full or disabled store is not an error.
  }
}
