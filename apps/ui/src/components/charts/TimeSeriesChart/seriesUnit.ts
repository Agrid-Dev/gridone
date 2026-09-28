import { attributeUnit } from "@/lib/attributeUnits";
import type { Series } from "./types";

/**
 * The unit a numeric series is plotted in: the one it declares, else the
 * name convention for its attribute (`semanticKey` names the attribute when
 * the series is keyed by something else, as a dashboard chart keyed per
 * device is), else null — an unlabelled axis, never a guessed unit.
 */
export function seriesUnit(series: Series): string | null {
  return attributeUnit(series.semanticKey ?? series.key, series);
}

/**
 * The unit shared by every series of a panel, or null when they disagree or
 * any of them is unitless — what a common axis can be labelled with.
 */
export function commonSeriesUnit(series: readonly Series[]): string | null {
  if (series.length === 0) return null;
  const [first, ...rest] = series.map(seriesUnit);
  return first != null && rest.every((unit) => unit === first) ? first : null;
}
