import type { DashboardStructure } from "@gridone/sdk";

/**
 * The structure as last fetched, remembered across visits so the sidebar
 * draws its entries on the first frame instead of after the request: one
 * entry per dashboard, and a list that arrives late shifts everything below
 * it. Stale for at most one fetch: the structure refreshes on mount.
 *
 * Storage can be unavailable and its contents are user-writable, so reads
 * validate the shape and every access is guarded.
 */
const KEY = "gridone.dashboards.structure";

function isStructure(value: unknown): value is DashboardStructure {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as DashboardStructure).items) &&
    (value as DashboardStructure).items.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.kind === "string" &&
        typeof item.id === "string",
    )
  );
}

export function readStoredStructure(): DashboardStructure | undefined {
  try {
    const stored = window.localStorage.getItem(KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : undefined;
    return isStructure(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredStructure(structure: DashboardStructure): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(structure));
  } catch {
    // A convenience only; a full or disabled store is not an error.
  }
}
