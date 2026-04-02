import type { TFunction } from "i18next";

export type TimeRangePreset =
  | "10m"
  | "30m"
  | "1h"
  | "3h"
  | "12h"
  | "1d"
  | "7d"
  | "all";

export type TimeRange =
  | { kind: "preset"; preset: TimeRangePreset }
  | { kind: "custom"; start: string; end: string };

export const DEFAULT_PRESET: TimeRangePreset = "3h";

type PresetOption = {
  value: TimeRangePreset;
  count: number;
  unitKey: string;
};

export const PRESET_OPTIONS: PresetOption[] = [
  { value: "10m", count: 10, unitKey: "rangeLastMinutes" },
  { value: "30m", count: 30, unitKey: "rangeLastMinutes" },
  { value: "1h", count: 1, unitKey: "rangeLastHours" },
  { value: "3h", count: 3, unitKey: "rangeLastHours" },
  { value: "12h", count: 12, unitKey: "rangeLastHours" },
  { value: "1d", count: 1, unitKey: "rangeLastDays" },
  { value: "7d", count: 7, unitKey: "rangeLastDays" },
];

export function resolveTimeRange(range: TimeRange): {
  start?: string;
  end?: string;
  last?: string;
} {
  if (range.kind === "custom") {
    return {
      start: range.start || undefined,
      end: range.end || undefined,
    };
  }
  if (range.preset === "all") {
    return {};
  }
  return { last: range.preset };
}

export function rangeLabel(range: TimeRange, t: TFunction): string {
  if (range.kind === "custom") {
    return t("deviceDetails.rangeCustom");
  }
  if (range.preset === "all") {
    return t("deviceDetails.rangeAll");
  }
  const option = PRESET_OPTIONS.find((o) => o.value === range.preset);
  if (!option) return range.preset;
  return t(`deviceDetails.${option.unitKey}`, {
    count: option.count,
  });
}

const VALID_PRESETS = new Set<string>([
  "10m",
  "30m",
  "1h",
  "3h",
  "12h",
  "1d",
  "7d",
  "all",
]);

/**
 * Parse URL search params into a TimeRange.
 * Reads `last`, `start`, `end` — matching the API query format.
 */
export function parseRangeParams(searchParams: URLSearchParams): TimeRange {
  const last = searchParams.get("last");
  if (last && VALID_PRESETS.has(last)) {
    return { kind: "preset", preset: last as TimeRangePreset };
  }

  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (start || end) {
    return { kind: "custom", start: start ?? "", end: end ?? "" };
  }

  return { kind: "preset", preset: DEFAULT_PRESET };
}

/**
 * Write a TimeRange into URL search params.
 * Uses `last`, `start`, `end` — matching the API query format.
 * The default preset (3h) produces no params to keep URLs clean.
 */
export function writeRangeParams(
  searchParams: URLSearchParams,
  range: TimeRange,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete("last");
  next.delete("start");
  next.delete("end");

  if (range.kind === "custom") {
    if (range.start) next.set("start", range.start);
    if (range.end) next.set("end", range.end);
  } else if (range.preset === "all") {
    next.set("last", "all");
  } else if (range.preset !== DEFAULT_PRESET) {
    next.set("last", range.preset);
  }

  return next;
}
