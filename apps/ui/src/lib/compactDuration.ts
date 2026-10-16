import type { TFunction } from "i18next";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A duration as a table cell writes it: "46 min", "1 h 10", "3 j 4 h". Two
 * units at most, the larger first, and floored so it never reads longer than
 * it lasted. Unlike {@link formatDurationSince}, which rounds to one unit for
 * prose, it keeps the minutes an alert's length is read in.
 */
export function formatCompactDuration(
  milliseconds: number,
  t: TFunction<"common">,
): string {
  const days = Math.floor(milliseconds / DAY);
  const hours = Math.floor((milliseconds % DAY) / HOUR);
  const minutes = Math.floor((milliseconds % HOUR) / MINUTE);
  if (days > 0) {
    return hours > 0
      ? t("common.compactDuration.daysHours", { days, hours })
      : t("common.compactDuration.days", { value: days });
  }
  if (hours > 0) {
    return minutes > 0
      ? t("common.compactDuration.hoursMinutes", {
          hours,
          minutes: String(minutes).padStart(2, "0"),
        })
      : t("common.compactDuration.hours", { value: hours });
  }
  if (minutes > 0)
    return t("common.compactDuration.minutes", { value: minutes });
  return t("common.compactDuration.lessThanAMinute");
}
