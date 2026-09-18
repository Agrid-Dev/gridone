import type { Location } from "react-router";

/** Accept only app-relative URLs, rejecting protocol-relative URLs and backslash escapes. */
export function internalUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return null;
  try {
    const url = new URL(value, "https://gridone.local");
    return url.origin === "https://gridone.local"
      ? `${url.pathname}${url.search}${url.hash}`
      : null;
  } catch {
    return null;
  }
}

export function locationUrl(
  location: Pick<Location, "pathname" | "search" | "hash">,
) {
  return `${location.pathname}${location.search}${location.hash}`;
}
