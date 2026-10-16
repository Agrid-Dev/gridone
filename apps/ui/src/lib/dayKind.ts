/** Bucket for a moment's local day: relative labels for the two most recent
 *  days, an absolute date otherwise. Days are compared on the calendar, not
 *  as 24-hour spans: the day a clock changes lasts 23 or 25 hours. */
export function dayKind(date: Date, now: Date): "today" | "yesterday" | "date" {
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, now)) return "today";
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  if (sameDay(date, yesterday)) return "yesterday";
  return "date";
}
