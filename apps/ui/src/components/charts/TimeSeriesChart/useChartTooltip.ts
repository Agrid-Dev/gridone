import { useCallback, useMemo, useRef, useState } from "react";

import type {
  FloatPanelEntry,
  PanelEntry,
  StringPanelEntry,
  TooltipRow,
} from "./types";
import type { FloatScaleContextType } from "./FloatScaleContext";
import { MARGIN, AXIS_EXTRA, TOOLTIP_OFFSET, CHART_COLORS } from "./constants";
import { nearestIndex } from "./nearestIndex";
import { getTooltipRows } from "./panels/registry";

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
  const floatPanelRef = useRef<HTMLDivElement | null>(null);
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

  // Build string value→color maps for tooltip swatches
  const stringColorMaps = useMemo(() => {
    const maps: Record<string, Map<string, string>> = {};
    for (const p of panels) {
      if (p.type !== "string") continue;
      const sp = p as StringPanelEntry;
      const seen = new Map<string, string>();
      for (const v of sp.values) {
        if (v !== null && !seen.has(v)) {
          seen.set(v, CHART_COLORS[seen.size % CHART_COLORS.length]);
        }
      }
      maps[sp.series.key] = seen;
    }
    return maps;
  }, [panels]);

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
    const rows: TooltipRow[] = [];
    for (const panel of panels) {
      const isActive = hoveredSection === panel.key || hoveredSection === null;
      const panelRows = getTooltipRows(
        panel,
        hoveredIdx,
        isActive,
        stringColorMaps,
      );

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

  // Tooltip positioning
  const tooltipEstH =
    40 +
    24 *
      panels.reduce((n, p) => {
        if (p.type === "float") return n + (p as FloatPanelEntry).series.length;
        return n + 1;
      }, 0);
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

  const floatScaleCtx: FloatScaleContextType = {
    panelRef: floatPanelRef,
    yScaleRef: floatYScaleRef,
  };

  return {
    containerRef,
    floatScaleCtx,
    handlePointerMove,
    handlePointerLeave,
    cursorX,
    cursorY,
    hoveredIdx,
    tooltipRows,
    tooltipLeft,
    tooltipTop,
  };
}
