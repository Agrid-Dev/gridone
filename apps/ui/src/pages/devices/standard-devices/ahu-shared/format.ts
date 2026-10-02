import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { unitSuffix } from "@/lib/attributeUnits";

export type ReadingFormat = (
  value: number | null | undefined,
  digits: number,
  unit?: string | null,
) => string;

/** A reading in the current locale ("22,4°", "1 250 Pa", "55 %"); an em
 *  dash when the device does not report it. */
export function useReadingFormat(): ReadingFormat {
  const { i18n } = useTranslation();
  return useCallback(
    (value, digits, unit) => {
      if (value == null) return "—";
      // Round first so a small negative ("-0.4" to no decimals) reads "0",
      // not "-0".
      const rounded = Number(value.toFixed(digits)) + 0;
      const number = new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(rounded);
      return `${number}${unitSuffix(unit)}`;
    },
    [i18n.language],
  );
}
