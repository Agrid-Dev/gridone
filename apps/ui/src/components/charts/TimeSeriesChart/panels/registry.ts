import type { ComponentType } from "react";

import type {
  PanelEntry,
  PanelComponentProps,
  TooltipRow,
  FloatPanelEntry,
  BooleanPanelEntry,
  StringPanelEntry,
} from "../types";
import { CHART_COLORS, BOOL_COLOR } from "../constants";
import { FloatPanel } from "./FloatPanel";
import { BooleanPanel } from "./BooleanPanel";
import { StringPanel } from "./StringPanel";

// ---------------------------------------------------------------------------
// Component registry — maps panel type → React component
// ---------------------------------------------------------------------------

export const panelRegistry: Record<
  PanelEntry["type"],
  ComponentType<PanelComponentProps>
> = {
  float: FloatPanel,
  boolean: BooleanPanel,
  string: StringPanel,
};

// ---------------------------------------------------------------------------
// Tooltip-row builders — maps panel type → row builder
// ---------------------------------------------------------------------------

export type TooltipRowOptions = {
  floatPrecision: number;
  stringColorMaps: Record<string, Map<string, string>>;
};

type TooltipRowBuilder = (
  entry: PanelEntry,
  hoveredIdx: number,
  active: boolean,
  options: TooltipRowOptions,
) => TooltipRow[];

function floatTooltipRows(
  entry: PanelEntry,
  hoveredIdx: number,
  active: boolean,
  options: TooltipRowOptions,
): TooltipRow[] {
  const { series, values } = entry as FloatPanelEntry;
  return series.map((s, i) => {
    const v = values[s.key]?.[hoveredIdx];
    return {
      label: s.label,
      value:
        v !== null && v !== undefined
          ? v.toFixed(options.floatPrecision)
          : "\u2014",
      active,
      swatch: {
        color: CHART_COLORS[i % CHART_COLORS.length],
        variant: "line" as const,
      },
    };
  });
}

function booleanTooltipRows(
  entry: PanelEntry,
  hoveredIdx: number,
  active: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: TooltipRowOptions,
): TooltipRow[] {
  const { series, values } = entry as BooleanPanelEntry;
  const v = values[hoveredIdx];
  return [
    {
      label: series.label,
      value: v === true ? "true" : v === false ? "false" : "\u2014",
      active,
      swatch: { color: BOOL_COLOR, variant: "area" as const },
    },
  ];
}

function stringTooltipRows(
  entry: PanelEntry,
  hoveredIdx: number,
  active: boolean,
  options: TooltipRowOptions,
): TooltipRow[] {
  const { series, values } = entry as StringPanelEntry;
  const v = values[hoveredIdx];
  const color = v ? options.stringColorMaps[series.key]?.get(v) : undefined;
  return [
    {
      label: series.label,
      value: v ?? "\u2014",
      active,
      swatch: color ? { color, variant: "area" as const } : undefined,
    },
  ];
}

const tooltipRowBuilders: Record<PanelEntry["type"], TooltipRowBuilder> = {
  float: floatTooltipRows,
  boolean: booleanTooltipRows,
  string: stringTooltipRows,
};

/** Build tooltip rows for a single panel entry. */
export function getTooltipRows(
  entry: PanelEntry,
  hoveredIdx: number,
  active: boolean,
  options: TooltipRowOptions,
): TooltipRow[] {
  return tooltipRowBuilders[entry.type](entry, hoveredIdx, active, options);
}
