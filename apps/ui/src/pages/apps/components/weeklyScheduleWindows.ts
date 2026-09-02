/**
 * `weekly_schedule` window math the widget needs for display only (an
 * overlap warning, a "uses default" caption) — kept in its own module,
 * separate from the widget's JSX, so there is one place to update if the
 * backend's scheduling rules change.
 */

/** Schema `day_of_week` order — must match the backend's `DAYS_OF_WEEK` /
 *  `date.weekday()` mapping (Monday=0..Sunday=6). */
export const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const WEEKEND_DAYS = new Set<string>(["saturday", "sunday"]);

/** Hotel-wide fields (siblings of `weekly_schedule`) a day's default falls
 *  back to when the room has no `zone_overrides` value of its own. */
export const HOTEL_CHECKIN_FIELD = "checkin_time";
export const HOTEL_CHECKOUT_FIELD = "checkout_time";
export const HOTEL_WEEKEND_CHECKIN_FIELD = "weekend_checkin_time";
export const HOTEL_WEEKEND_CHECKOUT_FIELD = "weekend_checkout_time";

export const DEFAULT_CHECKIN = "15:00";
export const DEFAULT_CHECKOUT = "12:00";

export interface HotelDefaults {
  checkin: string;
  checkout: string;
  weekendCheckin?: string;
  weekendCheckout?: string;
}

/** Whether `a` and `b` (both `[checkin, checkout]` HH:MM strings, overnight-
 *  shaped) share any instant. Mirrors the backend's `windows_overlap`. */
export function windowsOverlap(
  a: [string, string],
  b: [string, string],
): boolean {
  const span = (window: [string, string]): [number, number] => {
    const [hh, mm] = window[0].split(":").map(Number);
    const [ehh, emm] = window[1].split(":").map(Number);
    const start = hh * 60 + mm;
    let end = ehh * 60 + emm;
    if (end <= start) end += 24 * 60;
    return [start, end];
  };
  const [aStart, aEnd] = span(a);
  const [bStart, bEnd] = span(b);
  return aStart < bEnd && bStart < aEnd;
}

export function hasOverlap(windows: [string, string][]): boolean {
  return windows.some((a, i) =>
    windows.slice(i + 1).some((b) => windowsOverlap(a, b)),
  );
}

/** Resolves the (checkin, checkout) a room/day falls back to while it has no
 *  `weekly_schedule` row of its own: the room's `zone_overrides` value
 *  (weekday or weekend variant, picked independently per field) if set, else
 *  the hotel-wide value — the same per-field fallback order as the backend's
 *  `engine_config()` (`_hotel_engine_config` + `_override_engine_fields`). */
export function resolveDefaultWindow(
  day: string,
  hotel: HotelDefaults,
  override: Record<string, unknown> | undefined,
): { checkin: string; checkout: string } {
  const isWeekend = WEEKEND_DAYS.has(day);
  const overrideCheckin = override?.[HOTEL_CHECKIN_FIELD] as string | undefined;
  const overrideCheckout = override?.[HOTEL_CHECKOUT_FIELD] as
    | string
    | undefined;
  const overrideWeekendCheckin = override?.[HOTEL_WEEKEND_CHECKIN_FIELD] as
    | string
    | undefined;
  const overrideWeekendCheckout = override?.[HOTEL_WEEKEND_CHECKOUT_FIELD] as
    | string
    | undefined;

  const baseCheckin = overrideCheckin || hotel.checkin;
  const baseCheckout = overrideCheckout || hotel.checkout;
  const weekendCheckin = overrideWeekendCheckin || hotel.weekendCheckin;
  const weekendCheckout = overrideWeekendCheckout || hotel.weekendCheckout;

  return {
    checkin: isWeekend && weekendCheckin ? weekendCheckin : baseCheckin,
    checkout: isWeekend && weekendCheckout ? weekendCheckout : baseCheckout,
  };
}
