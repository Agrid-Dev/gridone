import type { TFunction } from "i18next";
import { dayKind } from "@/lib/dayKind";
import { capitalize } from "@/lib/textFormat";

const DAY = 24 * 60 * 60 * 1000;

/** The local day `date` falls on, named for prose: "aujourd'hui", "hier",
 *  else the weekday and date, with the year when it is not the current one. */
export function dayName(
  date: Date,
  now: Date,
  t: TFunction<"faults">,
  locale: string,
): string {
  const kind = dayKind(date, now);
  if (kind === "today") return t("faults.history.today");
  if (kind === "yesterday") return t("faults.history.yesterday");
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}

/** {@link dayName} capitalized, to head the alerts of that day. */
export function dayHeading(
  date: Date,
  now: Date,
  t: TFunction<"faults">,
  locale: string,
): string {
  return capitalize(dayName(date, now, t, locale), locale);
}

/** How many local calendar days separate two moments. Read on the calendar
 *  rather than as 24-hour spans, which a clock change would throw off. */
function calendarDaysBetween(from: Date, to: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(to) - day(from)) / DAY);
}

/** When an episode ran, in local times: "07:12 → 07:58", "13:30 → en
 *  cours", "22:40 → 00:35 (lendemain)", or the close's date when it came
 *  later still. The day the episode opened heads its group. */
export function episodeRange(
  { startMs, endMs }: { startMs: number; endMs: number | null },
  t: TFunction<"faults">,
  locale: string,
): string {
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const start = new Date(startMs);
  if (endMs === null) {
    return `${time.format(start)} → ${t("faults.history.ongoing")}`;
  }
  const end = new Date(endMs);
  const days = calendarDaysBetween(start, end);
  const close =
    days === 0
      ? time.format(end)
      : days === 1
        ? t("faults.history.nextDay", { time: time.format(end) })
        : `${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(end)} ${time.format(end)}`;
  return `${time.format(start)} → ${close}`;
}
