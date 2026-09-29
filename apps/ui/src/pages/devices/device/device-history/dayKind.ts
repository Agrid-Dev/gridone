/** Bucket for the two-line timestamp cell: relative day labels for the two
 *  most recent days, an absolute date otherwise. */
export function dayKind(date: Date, now: Date): "today" | "yesterday" | "date" {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = startOfDay(now) - startOfDay(date);
  if (diff === 0) return "today";
  if (diff === dayMs) return "yesterday";
  return "date";
}
