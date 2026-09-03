import { useMemo } from "react";

import type { PanelEntry, Series } from "./types";
import { DEFAULT_LINE_HEIGHT, DEFAULT_CATEGORICAL_HEIGHT } from "./constants";

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

    // Float and integer series share a single panel and y-axis — as lines,
    // integer ones flagged via stepKeys so they step rather than interpolate,
    // or as bars, where that distinction has nothing to say: a bar spans its
    // bucket whatever the numbers in it were.
    if (lineSeries.length > 0 || intSeries.length > 0) {
      const numericSeries = [...lineSeries, ...intSeries];
      const numericValues = { ...lineValues, ...intValues };
      panels.push(
        numericMark === "bar"
          ? {
              type: "bar",
              key: "bar",
              series: numericSeries,
              values: numericValues,
              height: lineHeight,
            }
          : {
              type: "float",
              key: "float",
              series: numericSeries,
              values: numericValues,
              stepKeys: intSeries.map((s) => s.key),
              height: lineHeight,
            },
      );
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
