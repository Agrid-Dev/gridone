import { foldText } from "./textFormat";

/** True when every word of `query`, folded, appears in the already folded
 *  text: "Air  Soufflé" matches "temperature air souffle". */
export function matchesAllWords(foldedText: string, query: string): boolean {
  return foldText(query)
    .split(/\s+/)
    .every((word) => foldedText.includes(word));
}

/** cmdk filter for attribute pickers: matches the raw name (value) or the
 *  label (keywords) on every typed word. Every match scores the same, so cmdk
 *  keeps the order the picker rendered. */
export function filterAttributeOption(
  value: string,
  query: string,
  keywords: string[] = [],
): number {
  return matchesAllWords(foldText([value, ...keywords].join(" ")), query)
    ? 1
    : 0;
}
