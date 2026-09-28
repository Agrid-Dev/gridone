/**
 * Formats the time axis' ticks in the user's locale.
 *
 * d3's default time format, which visx falls back on, spells its ticks in
 * English ("Aug 05", "02 PM"). Like d3 it picks the wording per tick from
 * the boundary the tick falls on — a tick on a midnight names the day, on a
 * month's first day the month, on a year's the year, anything else the time
 * of day — but through Intl, so a French reader gets "5 août" and "14:00".
 *
 * Kept on the runtime locale rather than the app's, like the value ticks and
 * the tooltip's timestamp: this subtree takes all its text from props.
 */
export function timeTickFormat(locale?: string): (date: Date) => string {
  const second = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const minute = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  });
  const month = new Intl.DateTimeFormat(locale, { month: "short" });
  const year = new Intl.DateTimeFormat(locale, { year: "numeric" });

  return (date: Date) => {
    if (date.getSeconds() !== 0 || date.getMilliseconds() !== 0)
      return second.format(date);
    if (date.getHours() !== 0 || date.getMinutes() !== 0)
      return minute.format(date);
    if (date.getDate() !== 1) return day.format(date);
    if (date.getMonth() !== 0) return month.format(date);
    return year.format(date);
  };
}

/** The runtime locale's formatter, shared by every panel's time axis. */
export const formatTimeTick = timeTickFormat();
