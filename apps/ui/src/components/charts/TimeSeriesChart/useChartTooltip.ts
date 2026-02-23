import {
  type MutableRefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Series, TooltipRow } from "./types";
import {
  MARGIN,
  AXIS_EXTRA,
  TOOLTIP_OFFSET,
  CHART_COLORS,
  BOOL_COLOR,
} from "./constants";
import { nearestIndex } from "./nearestIndex";

type UseChartTooltipArgs = {
  timestamps: Date[];
  width: number;
  lineSeries: Series[];
  lineValues: Record<string, (number | null)[]>;
  booleanSeries: Series[];
  booleanValues: Record<string, (boolean | null)[]>;
  stringSeries: Series[];
  stringValues: Record<string, (string | null)[]>;
  lineHeight: number;
  categoricalHeight: number;
};

export function useChartTooltip({
  timestamps,
  width,
  lineSeries,
  lineValues,
  booleanSeries,
  booleanValues,
  stringSeries,
  stringValues,
  lineHeight,
  categoricalHeight,
}: UseChartTooltipArgs) {
  const containerRef = useRef<HTMLDivElement>(null);
  const floatPanelRef = useRef<HTMLDivElement>(null);
  const floatYScaleRef = useRef<((v: number) => number) | null>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [cursorY, setCursorY] = useState<number | null>(null);

  const chartLeft = MARGIN.left;
  const chartRight = width - MARGIN.right;

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= chartLeft && x <= chartRight) {
        setCursorX(x);
        setCursorY(y);
      } else {
        setCursorX(null);
        setCursorY(null);
      }
    },
    [chartLeft, chartRight],
  );

  const handlePointerLeave = useCallback(() => {
    setCursorX(null);
    setCursorY(null);
  }, []);

  const hoveredIdx =
    cursorX !== null ? nearestIndex(cursorX, width, timestamps) : null;

  const hasFloats = lineSeries.length > 0;
  const hasBooleans = booleanSeries.length > 0;
  const hasStrings = stringSeries.length > 0;
  const isLastFloat = !hasBooleans && !hasStrings;

  const stringColorMaps = useMemo(() => {
    const maps: Record<string, Map<string, string>> = {};
    for (const s of stringSeries) {
      const vals = stringValues[s.key] ?? [];
      const seen = new Map<string, string>();
      for (const v of vals) {
        if (v !== null && !seen.has(v)) {
          seen.set(v, CHART_COLORS[seen.size % CHART_COLORS.length]);
        }
      }
      maps[s.key] = seen;
    }
    return maps;
  }, [stringSeries, stringValues]);

  const floatYDomain = useMemo(() => {
    for (const s of lineSeries) {
      const vals = lineValues[s.key];
      if (vals?.some((v) => v !== null)) return true;
    }
    return false;
  }, [lineSeries, lineValues]);

  const hoveredSection = useMemo(() => {
    if (cursorY === null) return null;
    let y = 0;
    const legendH = 26;
    if (hasFloats) {
      y += legendH;
      const fh = lineHeight + (isLastFloat ? AXIS_EXTRA : 0);
      if (cursorY < y + fh) return "float";
      y += fh;
    }
    for (let i = 0; i < booleanSeries.length; i++) {
      y += legendH;
      const isLast = !hasStrings && i === booleanSeries.length - 1;
      const bh = categoricalHeight + (isLast ? AXIS_EXTRA : 0);
      if (cursorY < y + bh) return booleanSeries[i].key;
      y += bh;
    }
    for (let i = 0; i < stringSeries.length; i++) {
      y += legendH;
      const isLast = i === stringSeries.length - 1;
      const sh = categoricalHeight + (isLast ? AXIS_EXTRA : 0);
      if (cursorY < y + sh) return stringSeries[i].key;
      y += sh;
    }
    return null;
  }, [
    cursorY,
    hasFloats,
    isLastFloat,
    booleanSeries,
    stringSeries,
    hasStrings,
    lineHeight,
    categoricalHeight,
  ]);

  const nearestFloatKey = useMemo(() => {
    if (
      hoveredSection !== "float" ||
      hoveredIdx === null ||
      cursorY === null ||
      !floatYDomain
    )
      return null;
    const yScale = floatYScaleRef.current;
    const panelEl = floatPanelRef.current;
    const containerEl = containerRef.current;
    if (!yScale || !panelEl || !containerEl) return null;
    const panelTop =
      panelEl.getBoundingClientRect().top -
      containerEl.getBoundingClientRect().top;
    let nearestKey: string | null = null;
    let nearestDist = Infinity;
    for (const s of lineSeries) {
      const v = lineValues[s.key]?.[hoveredIdx];
      if (v === null || v === undefined) continue;
      const seriesY = panelTop + yScale(v);
      const pxDist = Math.abs(cursorY - seriesY);
      if (pxDist < nearestDist) {
        nearestDist = pxDist;
        nearestKey = s.key;
      }
    }
    return nearestDist <= 32 ? nearestKey : null;
  }, [
    hoveredSection,
    hoveredIdx,
    cursorY,
    floatYDomain,
    lineSeries,
    lineValues,
  ]);

  const tooltipRows = useMemo(() => {
    if (hoveredIdx === null) return null;
    const rows: TooltipRow[] = [];
    for (let i = 0; i < lineSeries.length; i++) {
      const s = lineSeries[i];
      const v = lineValues[s.key]?.[hoveredIdx];
      rows.push({
        label: s.label,
        value: v !== null && v !== undefined ? v.toFixed(2) : "\u2014",
        active:
          hoveredSection === "float"
            ? nearestFloatKey === s.key
            : hoveredSection === null,
        swatch: {
          color: CHART_COLORS[i % CHART_COLORS.length],
          variant: "line",
        },
      });
    }
    for (const s of booleanSeries) {
      const v = booleanValues[s.key]?.[hoveredIdx];
      rows.push({
        label: s.label,
        value: v === true ? "true" : v === false ? "false" : "\u2014",
        active: hoveredSection === s.key || hoveredSection === null,
        swatch: { color: BOOL_COLOR, variant: "area" },
      });
    }
    for (const s of stringSeries) {
      const v = stringValues[s.key]?.[hoveredIdx];
      const color = v ? stringColorMaps[s.key]?.get(v) : undefined;
      rows.push({
        label: s.label,
        value: v ?? "\u2014",
        active: hoveredSection === s.key || hoveredSection === null,
        swatch: color ? { color, variant: "area" } : undefined,
      });
    }
    return rows;
  }, [
    hoveredIdx,
    hoveredSection,
    nearestFloatKey,
    lineSeries,
    lineValues,
    booleanSeries,
    booleanValues,
    stringSeries,
    stringValues,
    stringColorMaps,
  ]);

  const totalRows =
    lineSeries.length + booleanSeries.length + stringSeries.length;
  const tooltipEstH = 40 + 24 * totalRows;
  const containerH = containerRef.current?.offsetHeight ?? Infinity;

  const tooltipLeft =
    cursorX !== null
      ? cursorX + TOOLTIP_OFFSET + 180 > width
        ? cursorX - TOOLTIP_OFFSET - 180
        : cursorX + TOOLTIP_OFFSET
      : 0;

  const flipV =
    cursorY !== null && cursorY + TOOLTIP_OFFSET + tooltipEstH > containerH;
  const tooltipTop =
    cursorY !== null
      ? flipV
        ? cursorY - TOOLTIP_OFFSET - tooltipEstH
        : cursorY + TOOLTIP_OFFSET
      : 0;

  return {
    containerRef,
    floatPanelRef,
    floatYScaleRef: floatYScaleRef as MutableRefObject<
      ((v: number) => number) | null
    >,
    handlePointerMove,
    handlePointerLeave,
    cursorX,
    cursorY,
    hoveredIdx,
    tooltipRows,
    tooltipLeft,
    tooltipTop,
    hasFloats,
    hasBooleans,
    hasStrings,
    isLastFloat,
  };
}
