import type { Scalar } from "../conditions";
import type { Formatter } from "../document";

/**
 * Declarative value formatting of the presentation dialect: a number of
 * decimals, a unit symbol, or the time elapsed since a timestamp. Pure and
 * locale-aware; the widgets decide what to show for booleans and for
 * unknown values.
 */

export function formatNumber(
  value: number,
  decimals: number | undefined,
  language: string,
): string {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals ?? 2,
    useGrouping: false,
  }).format(value);
}

/** A timestamp value: ISO 8601 text, or epoch seconds/milliseconds. */
export function toTimestamp(value: Scalar): number | null {
  if (typeof value === "number") {
    // Epoch seconds until the year 2286, milliseconds beyond.
    return value < 1e11 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * "5 hours ago" in the largest fitting unit (minutes, hours, days), or null
 * when the value is not a timestamp.
 */
export function formatRelativeTime(
  value: Scalar,
  language: string,
  now: number = Date.now(),
): string | null {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return null;
  const elapsedMinutes = Math.round((timestamp - now) / 60000);
  const format = new Intl.RelativeTimeFormat(language, { numeric: "always" });
  const magnitude = Math.abs(elapsedMinutes);
  if (magnitude < 60) return format.format(elapsedMinutes, "minute");
  if (magnitude < 60 * 24) {
    return format.format(Math.trunc(elapsedMinutes / 60), "hour");
  }
  return format.format(Math.trunc(elapsedMinutes / (60 * 24)), "day");
}

/**
 * Text of a measured value, or null when the value is unknown (the widget
 * shows the formatter's `unavailable` text, then its own default).
 */
export function formatMeasurement(
  value: Scalar | null | undefined,
  formatter: Formatter | undefined,
  unit: string | null,
  language: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (formatter?.relative_time) return formatRelativeTime(value, language);
  if (typeof value === "number") {
    const text = formatNumber(value, formatter?.decimals, language);
    const symbol = formatter?.unit ?? unit;
    return symbol ? `${text} ${symbol}` : text;
  }
  return String(value);
}

/** Signed difference of two numbers, formatted with the row's decimals. */
export function formatDeviation(
  delta: number,
  decimals: number | undefined,
  unit: string | null,
  language: string,
): string {
  const sign = delta > 0 ? "+" : "";
  const text = `${sign}${formatNumber(delta, decimals ?? 1, language)}`;
  return unit ? `${text} ${unit}` : text;
}
