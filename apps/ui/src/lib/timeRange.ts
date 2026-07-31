import type { TFunction } from "i18next";

export type TimeRangePreset =
  | "10m"
  | "30m"
  | "1h"
  | "3h"
  | "12h"
  | "1d"
  | "7d"
  | "1mo"
  | "3mo"
  | "6mo"
  | "12mo"
  | "all";

export type TimeRange =
  | { kind: "preset"; preset: TimeRangePreset }
  | { kind: "custom"; start: string; end: string };

/** Preset a device-scoped view opens on: those read live equipment, where the
 *  useful window is the last few hours. */
export const DEFAULT_PRESET: TimeRangePreset = "3h";

/** Preset a dashboard opens on. Dashboards answer "how did the building behave"
 *  rather than "what is this device doing now", so they start a week out. */
export const DASHBOARD_DEFAULT_PRESET: TimeRangePreset = "7d";

export type PresetOption = {
  value: TimeRangePreset;
  count: number;
  unitKey: string;
};

/**
 * Every relative preset the UI can express, keyed by the value written to the
 * URL and sent to the API as `last`.
 *
 * The suffixes are the API's duration vocabulary (`min`, `h`, `d`, `mo`) — the
 * value travels verbatim, so a preset the API cannot parse would fail at read
 * time rather than here. Note `mo` is a flat 30 days server-side, which is why
 * the month labels are nominal rather than calendar months.
 */
const PRESETS: Record<Exclude<TimeRangePreset, "all">, PresetOption> = {
  "10m": { value: "10m", count: 10, unitKey: "rangeLastMinutes" },
  "30m": { value: "30m", count: 30, unitKey: "rangeLastMinutes" },
  "1h": { value: "1h", count: 1, unitKey: "rangeLastHours" },
  "3h": { value: "3h", count: 3, unitKey: "rangeLastHours" },
  "12h": { value: "12h", count: 12, unitKey: "rangeLastHours" },
  "1d": { value: "1d", count: 1, unitKey: "rangeLastDays" },
  "7d": { value: "7d", count: 7, unitKey: "rangeLastDays" },
  "1mo": { value: "1mo", count: 1, unitKey: "rangeLastMonths" },
  "3mo": { value: "3mo", count: 3, unitKey: "rangeLastMonths" },
  "6mo": { value: "6mo", count: 6, unitKey: "rangeLastMonths" },
  "12mo": { value: "12mo", count: 12, unitKey: "rangeLastMonths" },
};

/** Presets offered on device-scoped views (history, commands). */
export const PRESET_OPTIONS: PresetOption[] = [
  PRESETS["10m"],
  PRESETS["30m"],
  PRESETS["1h"],
  PRESETS["3h"],
  PRESETS["12h"],
  PRESETS["1d"],
  PRESETS["7d"],
];

/**
 * Presets offered on dashboards: the same ladder shifted up, dropping the
 * sub-hour end and reaching a year out.
 *
 * A dashboard aggregates a whole building over a period, so the windows that
 * matter are the ones an energy or comfort trend shows up in — the ten-minute
 * view a device page needs to see a valve move says nothing here.
 */
export const DASHBOARD_PRESET_OPTIONS: PresetOption[] = [
  PRESETS["12h"],
  PRESETS["1d"],
  PRESETS["7d"],
  PRESETS["1mo"],
  PRESETS["3mo"],
  PRESETS["6mo"],
  PRESETS["12mo"],
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

export function rangeLabel(range: TimeRange, t: TFunction<"common">): string {
  if (range.kind === "custom") {
    return t("timeRange.rangeCustom");
  }
  if (range.preset === "all") {
    return t("timeRange.rangeAll");
  }
  // Read from the full table, not from a view's option list: a preset can
  // reach a view it does not itself offer (a shared link, or a preference
  // remembered from elsewhere), and it must still render as a label.
  const option = PRESETS[range.preset];
  return t(`timeRange.${option.unitKey}` as "timeRange.rangeLastMinutes", {
    count: option.count,
  });
}

/**
 * Whether the range tracks the present — a preset (always relative to now) or
 * a custom range with an open end. Views that must stay current on an unattended
 * screen poll only while this holds; a closed custom range is settled history
 * and never needs a refetch.
 */
export function rangeEndsNow(range: TimeRange): boolean {
  return range.kind === "preset" || !range.end;
}

const VALID_PRESETS = new Set<string>([...Object.keys(PRESETS), "all"]);

/** Narrows an untrusted string — a URL param, a stored preference — to a
 *  preset. Anything else is treated as absent by the callers. */
export function isTimeRangePreset(value: string): value is TimeRangePreset {
  return VALID_PRESETS.has(value);
}

/** Whether the URL already carries a period of its own. Callers that would
 *  otherwise impose one (a remembered preference) must defer to it, so that a
 *  shared link always reproduces the view it was copied from. */
export function hasRangeParams(searchParams: URLSearchParams): boolean {
  return (
    searchParams.has("last") ||
    searchParams.has("start") ||
    searchParams.has("end")
  );
}

/**
 * Parse URL search params into a TimeRange.
 * Reads `last`, `start`, `end` — matching the API query format.
 */
export function parseRangeParams(
  searchParams: URLSearchParams,
  defaultPreset: TimeRangePreset = DEFAULT_PRESET,
): TimeRange {
  const last = searchParams.get("last");
  if (last && isTimeRangePreset(last)) {
    return { kind: "preset", preset: last };
  }

  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (start || end) {
    return { kind: "custom", start: start ?? "", end: end ?? "" };
  }

  return { kind: "preset", preset: defaultPreset };
}

/**
 * Write a TimeRange into URL search params.
 * Uses `last`, `start`, `end` — matching the API query format.
 * The view's default preset produces no params, to keep URLs clean.
 */
export function writeRangeParams(
  searchParams: URLSearchParams,
  range: TimeRange,
  defaultPreset: TimeRangePreset = DEFAULT_PRESET,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete("last");
  next.delete("start");
  next.delete("end");

  if (range.kind === "custom") {
    if (range.start) next.set("start", range.start);
    if (range.end) next.set("end", range.end);
  } else if (range.preset !== defaultPreset) {
    // The default preset produces no params, to keep URLs clean.
    next.set("last", range.preset);
  }

  return next;
}
