import { useMemo } from "react";

import type { Series } from "./types";
import { commonAttributeUnit } from "@/lib/attributeUnits";

/**
 * Formats the value axis' ticks for a panel of numeric series.
 *
 * Ticks carry the unit when every series on the shared axis has the same one.
 * `semanticKey` names the attribute when the series is keyed by something else
 * (a dashboard chart keys per device), same as the string panel's colour
 * lookup.
 *
 * Kept on the runtime locale rather than the app's: this subtree takes all its
 * text from props, and pulling i18n in for a decimal separator would make
 * every chart consumer wire up a translation provider.
 */
export function useValueTickFormat(
  series: Series[],
): (value: number) => string {
  return useMemo(() => {
    const unit = commonAttributeUnit(series.map((s) => s.semanticKey ?? s.key));
    // A tick label must hold no whitespace: `@visx/text` wraps on it, so
    // "10 000 W" renders stacked over three lines. Hence no group separator
    // (a narrow no-break space in several locales) and no space before the
    // unit. Intl still rounds away d3's binary tick noise (0.30000000000004)
    // and keeps the locale's decimal separator.
    const number = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
      useGrouping: false,
    });
    return (value: number) => `${number.format(value)}${unit ?? ""}`;
  }, [series]);
}
