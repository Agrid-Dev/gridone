import { tagValues } from "@/lib/devices";
import { z } from "zod";
import type { Device, DevicesFilter } from "@gridone/sdk";

export const tagToken = z
  .string()
  .transform((value) => value.normalize("NFC").toLowerCase().normalize("NFC"))
  .pipe(
    z
      .string()
      .min(1)
      .max(63)
      .regex(/^[\p{L}\p{N}_.-]+$/u),
  );

/** Parse key:value pairs, for example étage:2, étage:3, pièce:ch_204. */
export function parseTagCriteria(text: string): Record<string, string[]> {
  const result = new Map<string, string[]>();
  if (!text.trim()) return {};
  for (const pair of text.split(",")) {
    const parts = pair.trim().split(":");
    if (parts.length !== 2) throw new Error("Use key:value");
    const key = tagToken.parse(parts[0]);
    const value = tagToken.parse(parts[1]);
    result.set(key, [...new Set([...(result.get(key) ?? []), value])]);
  }
  return Object.fromEntries(result);
}
export function formatTagCriteria(tags?: Record<string, string[]> | null) {
  return Object.entries(tags ?? {})
    .flatMap(([key, values]) => values.map((value) => `${key}:${value}`))
    .join(", ");
}
export function groupedValues(
  devices: Device[],
  key: string,
  filter: DevicesFilter,
) {
  const groups = new Map<string, Set<string>>();
  const allowed = Object.hasOwn(filter.tags ?? {}, key)
    ? filter.tags![key]
    : undefined;
  for (const device of devices)
    for (const value of tagValues(device.tags, key)) {
      if (allowed && !allowed.includes(value)) continue;
      if (!groups.has(value)) groups.set(value, new Set());
      groups.get(value)!.add(device.id);
    }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([value, ids]) => ({ value, count: ids.size }));
}

/** Narrow a saved filter by a drilldown path without widening its existing criteria. */
export function drilldownFilter(
  base: DevicesFilter,
  keys: string[],
  path: string[],
): DevicesFilter {
  let tags = { ...base.tags };
  path.slice(0, keys.length).forEach((value, index) => {
    const key = keys[index];
    const allowed = Object.hasOwn(base.tags ?? {}, key)
      ? base.tags![key]
      : undefined;
    tags = {
      ...tags,
      [key]: allowed && !allowed.includes(value) ? [] : [value],
    };
  });
  return { ...base, tags };
}
