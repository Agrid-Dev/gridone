/**
 * Extract the search portion from an API pagination link
 * to use as a client-side route search string.
 * Returns `undefined` when the link is absent.
 */
export function toSearchString(link: string | null): string | undefined {
  if (!link) return undefined;
  return new URL(link).search || "?";
}
