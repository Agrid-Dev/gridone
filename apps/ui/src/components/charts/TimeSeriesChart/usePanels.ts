import { useMemo } from "react";

import type { PanelEntry, Series } from "./types";
import {
  DEFAULT_LINE_HEIGHT,
  DEFAULT_CATEGORICAL_HEIGHT,
  EMPTY_LINE_HEIGHT,
} from "./constants";
import { groupSeriesByUnit } from "./seriesUnit";

type UsePanelsArgs = {
  lineSeries: Series[];
  lineValues: Record<string, (number | null)[]>;
  intSeries: Series[];
  intValues: Record<string, (number | null)[]>;
  booleanSeries: Series[];
  booleanValues: Record<string, (boolean | null)[]>;
  stringSeries: Series[];
  stringValues: Record<string, (string | null)[]>;
  numericMark?: "line" | "bar";
  lineHeight?: number;
  categoricalHeight?: number;
};

/** Builds the ordered flat list of PanelEntry descriptors from chart props. */
export function usePanels({
  lineSeries,
  lineValues,
  intSeries,
  intValues,
  booleanSeries,
  booleanValues,
  stringSeries,
  stringValues,
  numericMark = "line",
  lineHeight = DEFAULT_LINE_HEIGHT,
  categoricalHeight = DEFAULT_CATEGORICAL_HEIGHT,
}: UsePanelsArgs): PanelEntry[] {
  return useMemo(() => {
    const panels: PanelEntry[] = [];

    // Float and integer series are drawn as lines, integer ones flagged via
    // stepKeys so they step rather than interpolate, one panel per unit so a
    // temperature and a percentage never share a scale; or as bars, where
    // neither distinction has anything to say: a bar spans its bucket
    // whatever the numbers in it were, and bars only ever plot one attribute.
    if (lineSeries.length > 0 || intSeries.length > 0) {
      const numericSeries = [...lineSeries, ...intSeries];
      const numericValues = { ...lineValues, ...intValues };
      if (numericMark === "bar") {
        panels.push({
          type: "bar",
          key: "bar",
          series: numericSeries,
          values: numericValues,
          height: lineHeight,
        });
      } else {
        const stepKeySet = new Set(intSeries.map((s) => s.key));
        let colorOffset = 0;
        for (const [unit, series] of groupSeriesByUnit(numericSeries)) {
          // A unit with nothing to plot in the window keeps its legend, so
          // the series still reads as selected, over a strip rather than a
          // full-height blank.
          const hasData = series.some((s) =>
            numericValues[s.key]?.some((v) => v !== null),
          );
          panels.push({
            type: "float",
            key: `float:${unit ?? ""}`,
            unit,
            series,
            values: numericValues,
            stepKeys: series.map((s) => s.key).filter((k) => stepKeySet.has(k)),
            height: hasData ? lineHeight : EMPTY_LINE_HEIGHT,
            colorOffset,
          });
          colorOffset += series.length;
        }
      }
    }

    for (const s of booleanSeries) {
      panels.push({
        type: "boolean",
        key: s.key,
        series: s,
        values: booleanValues[s.key] ?? [],
        height: categoricalHeight,
      });
    }

    for (const s of stringSeries) {
      panels.push({
        type: "string",
        key: s.key,
        series: s,
        values: stringValues[s.key] ?? [],
        height: categoricalHeight,
      });
    }

    return panels;
  }, [
    lineSeries,
    lineValues,
    intSeries,
    intValues,
    booleanSeries,
    booleanValues,
    stringSeries,
    stringValues,
    numericMark,
    lineHeight,
    categoricalHeight,
  ]);
}
