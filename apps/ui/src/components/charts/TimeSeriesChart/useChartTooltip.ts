import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  FloatPanelEntry,
  PanelEntry,
  StringPanelEntry,
  TooltipRow,
} from "./types";
import type { FloatScaleContextType } from "./FloatScaleContext";
import { MARGIN, AXIS_EXTRA, CHART_COLORS, OTHER_COLOR } from "./constants";
import { computeTopStringValues } from "./topStringValues";
import { indexAtOrBefore, timeAtCursor } from "./hoverPoint";
import { placeTooltip } from "./placeTooltip";
import { attributeValueChartColor } from "@/lib/semanticColors";
import { getTooltipRows, type TooltipRowOptions } from "./panels/registry";

type UseChartTooltipArgs = {
  timestamps: Date[];
  width: number;
  panels: PanelEntry[];
};

export function useChartTooltip({
  timestamps,
  width,
  panels,
}: UseChartTooltipArgs) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const floatPanelRef = useRef<HTMLDivElement>(null);
  const floatYScaleRef = useRef<((v: number) => number) | null>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [cursorY, setCursorY] = useState<number | null>(null);

  const chartLeft = MARGIN.left;
  const chartRight = width - MARGIN.right;

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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

  // The cursor names an instant of its own, read off the axis; the values shown
  // are those in force at that instant, i.e. the most recent reading at or
  // before it.
  const hoveredTime =
    cursorX !== null ? timeAtCursor(cursorX, width, timestamps) : null;
  const hoveredIdx =
    hoveredTime !== null ? indexAtOrBefore(timestamps, hoveredTime) : null;

  // Build string value→color maps for tooltip swatches
  const stringColorMaps = useMemo(() => {
    const maps: Record<string, Map<string, string>> = {};
    for (const p of panels) {
      if (p.type !== "string") continue;
      const sp = p as StringPanelEntry;
      const { displayValues } = computeTopStringValues(sp.values, timestamps);
      const colorMap = new Map<string, string>();
      for (let i = 0; i < displayValues.length; i++) {
        colorMap.set(
          displayValues[i],
          attributeValueChartColor(sp.series.key, displayValues[i]) ??
            CHART_COLORS[i % CHART_COLORS.length],
        );
      }
      // Any value not in topSet gets OTHER_COLOR (looked up on demand)
      for (const v of sp.values) {
        if (v !== null && !colorMap.has(v)) {
          colorMap.set(v, OTHER_COLOR);
        }
      }
      maps[sp.series.key] = colorMap;
    }
    return maps;
  }, [panels, timestamps]);

  // Check whether any float data exists (for nearestFloatKey guard)
  const hasFloatData = useMemo(() => {
    const fp = panels.find((p) => p.type === "float") as
      | FloatPanelEntry
      | undefined;
    if (!fp) return false;
    return fp.series.some((s) => fp.values[s.key]?.some((v) => v !== null));
  }, [panels]);

  // Detect which panel the cursor is hovering over
  const hoveredSection = useMemo(() => {
    if (cursorY === null) return null;
    let y = 0;
    const legendH = 26;
    for (let i = 0; i < panels.length; i++) {
      y += legendH;
      const isLast = i === panels.length - 1;
      const ph = panels[i].height + (isLast ? AXIS_EXTRA : 0);
      if (cursorY < y + ph) return panels[i].key;
      y += ph;
    }
    return null;
  }, [cursorY, panels]);

  // When hovering the float panel, find the nearest-by-Y series (within 32px)
  const nearestFloatKey = useMemo(() => {
    if (
      hoveredSection !== "float" ||
      hoveredIdx === null ||
      cursorY === null ||
      !hasFloatData
    )
      return null;
    const yScale = floatYScaleRef.current;
    const panelEl = floatPanelRef.current;
    const containerEl = containerRef.current;
    if (!yScale || !panelEl || !containerEl) return null;
    const panelTop =
      panelEl.getBoundingClientRect().top -
      containerEl.getBoundingClientRect().top;

    const fp = panels.find((p) => p.type === "float") as
      | FloatPanelEntry
      | undefined;
    if (!fp) return null;

    let nearestKey: string | null = null;
    let nearestDist = Infinity;
    for (const s of fp.series) {
      const v = fp.values[s.key]?.[hoveredIdx];
      if (v === null || v === undefined) continue;
      const seriesY = panelTop + yScale(v);
      const pxDist = Math.abs(cursorY - seriesY);
      if (pxDist < nearestDist) {
        nearestDist = pxDist;
        nearestKey = s.key;
      }
    }
    return nearestDist <= 32 ? nearestKey : null;
  }, [hoveredSection, hoveredIdx, cursorY, hasFloatData, panels]);

  // Build tooltip rows by iterating over panels
  const tooltipRows = useMemo(() => {
    if (hoveredIdx === null) return null;
    const options: TooltipRowOptions = {
      floatPrecision: 2,
      stringColorMaps,
    };
    const rows: TooltipRow[] = [];
    for (const panel of panels) {
      const isActive = hoveredSection === panel.key || hoveredSection === null;
      const panelRows = getTooltipRows(panel, hoveredIdx, isActive, options);

      // Refine float active state based on Y proximity
      if (panel.type === "float" && hoveredSection === "float") {
        const fp = panel as FloatPanelEntry;
        for (let i = 0; i < panelRows.length; i++) {
          panelRows[i].active = nearestFloatKey === fp.series[i].key;
        }
      }

      rows.push(...panelRows);
    }
    return rows;
  }, [hoveredIdx, hoveredSection, nearestFloatKey, panels, stringColorMaps]);

  // Tooltip positioning. The box is measured rather than estimated: its width
  // depends on the series labels, which the caller supplies and which can be
  // several times any constant we might pick. Guessing meant the "does it fit?"
  // test was wrong for long labels, and the box ran outside the chart — clipped
  // outright wherever an ancestor hides overflow, as a dashboard tile does.
  const [tooltipSize, setTooltipSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    // Measured before paint, so the first frame is already placed correctly.
    setTooltipSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, [tooltipRows]);

  const containerH = containerRef.current?.offsetHeight ?? Infinity;

  const tooltipLeft =
    cursorX !== null ? placeTooltip(cursorX, tooltipSize.w, width) : 0;
  const tooltipTop =
    cursorY !== null ? placeTooltip(cursorY, tooltipSize.h, containerH) : 0;

  const floatScaleCtx: FloatScaleContextType = {
    panelRef: floatPanelRef,
    yScaleRef: floatYScaleRef,
  };

  return {
    containerRef,
    tooltipRef,
    floatScaleCtx,
    handlePointerMove,
    handlePointerLeave,
    cursorX,
    cursorY,
    hoveredIdx,
    hoveredTime,
    tooltipRows,
    tooltipLeft,
    tooltipTop,
  };
}
