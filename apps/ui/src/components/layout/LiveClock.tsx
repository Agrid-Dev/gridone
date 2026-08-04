import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNow } from "@/hooks/useNow";

/** Current date and time in the topbar, e.g. "mar. 21 juillet · 16:45".
 *
 *  Owns the ``useNow`` subscription so the minute tick re-renders this leaf
 *  alone, not the search field, the bell and its query subtree.
 *
 *  Formatters are memoized on the language: constructing an ``Intl`` formatter
 *  is not free, and this component re-renders every minute. */
export function LiveClock() {
  const { i18n } = useTranslation("common");
  const now = useNow();

  const [dateFormat, timeFormat] = useMemo(
    () => [
      new Intl.DateTimeFormat(i18n.language, {
        weekday: "short",
        day: "numeric",
        month: "long",
      }),
      new Intl.DateTimeFormat(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    ],
    [i18n.language],
  );

  return (
    <time
      dateTime={now.toISOString()}
      className="hidden text-sm text-muted-foreground lg:block"
    >
      {dateFormat.format(now)} · {timeFormat.format(now)}
    </time>
  );
}
