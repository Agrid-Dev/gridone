import { foldText } from "./textFormat";

/** True when every word of `query`, folded, appears in the already folded
 *  text: "Air  Soufflé" matches "temperature air souffle". */
export function matchesAllWords(foldedText: string, query: string): boolean {
  return foldText(query)
    .split(/\s+/)
    .every((word) => foldedText.includes(word));
}

/** cmdk filter: an item matches when every typed word appears in its value
 *  or keywords (e.g. an attribute's raw name and label). Every match scores
 *  the same, so cmdk keeps the order the list rendered. */
export function filterByAllWords(
  value: string,
  query: string,
  keywords: string[] = [],
): number {
  return matchesAllWords(foldText([value, ...keywords].join(" ")), query)
    ? 1
    : 0;
}
