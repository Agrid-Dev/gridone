import { useMemo } from "react";

import type { PanelEntry, Series } from "./types";
import { DEFAULT_LINE_HEIGHT, DEFAULT_CATEGORICAL_HEIGHT } from "./constants";

type UsePanelsArgs = {
  lineSeries: Series[];
  lineValues: Record<string, (number | null)[]>;
  booleanSeries: Series[];
  booleanValues: Record<string, (boolean | null)[]>;
  stringSeries: Series[];
  stringValues: Record<string, (string | null)[]>;
  lineHeight?: number;
  categoricalHeight?: number;
};

/** Builds the ordered flat list of PanelEntry descriptors from chart props. */
export function usePanels({
  lineSeries,
  lineValues,
  booleanSeries,
  booleanValues,
  stringSeries,
  stringValues,
  lineHeight = DEFAULT_LINE_HEIGHT,
  categoricalHeight = DEFAULT_CATEGORICAL_HEIGHT,
}: UsePanelsArgs): PanelEntry[] {
  return useMemo(() => {
    const panels: PanelEntry[] = [];

    if (lineSeries.length > 0) {
      panels.push({
        type: "float",
        key: "float",
        series: lineSeries,
        values: lineValues,
        height: lineHeight,
      });
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
    booleanSeries,
    booleanValues,
    stringSeries,
    stringValues,
    lineHeight,
    categoricalHeight,
  ]);
}
