import type { Device } from "@gridone/sdk";
import { defaultFilter } from "cmdk";
import { parseResourceReference } from "./resourceReference";
import { compareByName } from "./sortByName";

/** Match the viewer's per-group cap to keep large fleets scannable. */
export const DEVICE_SEARCH_LIMIT = 40;

/**
 * Rank exact matches, prefixes, word starts, then other substrings.
 * A word starts after a non-letter/digit: e.g. "ECS" in "Ballon_ECS".
 * Check every occurrence so "abecs ECS" still counts as a word-start match.
 */
function fieldScore(value: string, query: string): number {
  const text = value.toLowerCase();
  if (text === query) return 4;
  if (text.startsWith(query)) return 3;
  let index = text.indexOf(query);
  if (index === -1) return 0;
  while (index !== -1) {
    if (!/[\p{L}\p{N}]$/u.test(text.slice(0, index))) {
      return 2;
    }
    index = text.indexOf(query, index + 1);
  }
  return 1;
}

/** Prefer names over IDs within each match tier; never match across fields. */
function deviceScore(name: string, id: string, query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  return (
    Math.max(fieldScore(name, needle) * 2, fieldScore(id, needle) * 2 - 1) / 8
  );
}

/** Rank the entire fleet before truncating, with alphabetical ties. */
export function searchDevices(devices: readonly Device[], query: string) {
  const matches = devices
    .map((device) => ({
      device,
      score: deviceScore(device.name, device.id, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || compareByName(a.device, b.device));

  return {
    devices: matches.slice(0, DEVICE_SEARCH_LIMIT).map(({ device }) => device),
    overflow: Math.max(0, matches.length - DEVICE_SEARCH_LIMIT),
  };
}

/** Use the same device ranking in cmdk; preserve its zone and fault search.
 *
 *  Device rows are recognized by their ``resource://device/<id>`` value and
 *  carry their searchable text in ``keywords`` (name first, then id). Zone and
 *  fault rows keep a human-readable value because that is what
 *  ``defaultFilter`` matches on — only rows bringing their own scorer can
 *  afford an opaque one. */
export function filterGlobalSearch(
  value: string,
  query: string,
  keywords?: string[],
): number {
  const reference = parseResourceReference(value);
  if (reference?.type === "device" && keywords) {
    return deviceScore(keywords[0] ?? "", keywords[1] ?? "", query);
  }
  return defaultFilter(value, query, keywords);
}
