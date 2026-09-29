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

/**
 * `series` grouped by the unit they plot in, in order of first appearance.
 *
 * A unit the name convention supplies is a family, not a scale: `°` says
 * "a temperature", where a declared `°C` says which. So when one series
 * declares a unit and another of the same family relies on the convention
 * (a `temperature` declaring `°C` next to a bare `temperature_setpoint`),
 * the bare one joins the declared panel — provided exactly one declared
 * unit of that family exists; `°C` and `°F` side by side leave `°` alone.
 */
export function groupSeriesByUnit(
  series: readonly Series[],
): Map<string | null, Series[]> {
  const declared = new Set(series.flatMap((s) => (s.unit ? [s.unit] : [])));
  const fold = (unit: string | null): string | null => {
    if (unit === null || declared.has(unit)) return unit;
    const family = [...declared].filter((d) => d.startsWith(unit));
    return family.length === 1 ? family[0] : unit;
  };
  const groups = new Map<string | null, Series[]>();
  for (const s of series) {
    const unit = fold(seriesUnit(s));
    groups.set(unit, [...(groups.get(unit) ?? []), s]);
  }
  return groups;
}
