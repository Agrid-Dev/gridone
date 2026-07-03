/** Alphabetical, case-insensitive comparator on `name`, falling back to
 *  `id` for unnamed resources. Use it everywhere a resource list renders
 *  so ordering stays consistent across the app. */
export function compareByName(
  a: { id: string; name?: string | null },
  b: { id: string; name?: string | null },
): number {
  return (a.name || a.id).localeCompare(b.name || b.id, undefined, {
    sensitivity: "base",
  });
}

/** Non-mutating alphabetical sort by `name` (see {@link compareByName}). */
export function sortedByName<T extends { id: string; name?: string | null }>(
  items: readonly T[],
): T[] {
  return [...items].sort(compareByName);
}
