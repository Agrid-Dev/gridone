export type PaginationLinks = {
  self: string;
  first: string;
  last: string;
  next: string | null;
  prev: string | null;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
  links: PaginationLinks;
};

/**
 * Extract the search portion from an API pagination link
 * to use as a client-side route search string.
 * Returns `undefined` when the link is absent.
 */
export function toSearchString(link: string | null): string | undefined {
  if (!link) return undefined;
  return new URL(link).search || "?";
}
