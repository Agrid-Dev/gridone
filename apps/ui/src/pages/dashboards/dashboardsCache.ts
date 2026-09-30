import type { DashboardSummary } from "@gridone/sdk";

/**
 * The dashboard summaries as last fetched, remembered across visits so the
 * sidebar draws its entries on the first frame instead of after the request:
 * one entry per dashboard, and a list that arrives late shifts everything
 * below it. Stale for at most one fetch: the list refreshes on mount.
 *
 * Storage can be unavailable and its contents are user-writable, so reads
 * validate the shape and every access is guarded.
 */
const KEY = "gridone.dashboards";

function isSummary(value: unknown): value is DashboardSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DashboardSummary).id === "string" &&
    typeof (value as DashboardSummary).name === "string"
  );
}

export function readStoredDashboards(): DashboardSummary[] | undefined {
  try {
    const stored = window.localStorage.getItem(KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : undefined;
    return Array.isArray(parsed) && parsed.every(isSummary)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredDashboards(summaries: DashboardSummary[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(summaries));
  } catch {
    // A convenience only; a full or disabled store is not an error.
  }
}
