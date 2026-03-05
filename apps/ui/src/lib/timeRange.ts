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
  return t(`deviceDetails.${option.unitKey}`, { count: option.count });
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

export function parseRangeParams(searchParams: URLSearchParams): TimeRange {
  const range = searchParams.get("range");
  if (range && VALID_PRESETS.has(range)) {
    return { kind: "preset", preset: range as TimeRangePreset };
  }

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from || to) {
    return { kind: "custom", start: from ?? "", end: to ?? "" };
  }

  return { kind: "preset", preset: DEFAULT_PRESET };
}

export function writeRangeParams(
  searchParams: URLSearchParams,
  range: TimeRange,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete("range");
  next.delete("from");
  next.delete("to");

  if (range.kind === "custom") {
    if (range.start) next.set("from", range.start);
    if (range.end) next.set("to", range.end);
  } else if (range.preset !== DEFAULT_PRESET) {
    next.set("range", range.preset);
  }

  return next;
}
