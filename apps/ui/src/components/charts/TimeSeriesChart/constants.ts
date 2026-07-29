import { lightTheme } from "@visx/xychart";
import type { FloatDatum, BoolDatum } from "./types";

export const DEFAULT_LINE_HEIGHT = 350;
export const DEFAULT_CATEGORICAL_HEIGHT = 60;
export const MARGIN = { top: 8, right: 16, bottom: 32, left: 48 };
export const MARGIN_NO_BOTTOM = { ...MARGIN, bottom: 4 };
export const AXIS_EXTRA = MARGIN.bottom - MARGIN_NO_BOTTOM.bottom;

/** Height of the legend band each panel renders above its plot.
 *
 * Measured from `legendStyle` — 12px of top padding over a 14px line — rather
 * than from the DOM: it is needed for hit-testing during a pointer move, and to
 * size a panel to the box that contains it, both of which run before the legend
 * would have been laid out. Keep it in step with `legendStyle`. */
export const LEGEND_HEIGHT = 26;

/** Vertical space a chart spends on chrome rather than plot, per panel: the
 *  legend above it, and the bottom margin the last panel adds for the time
 *  axis. A caller sizing a panel to fill a fixed box subtracts this — the chart
 *  takes its panel height in pixels and does not fill its parent. */
export const PANEL_CHROME_HEIGHT = LEGEND_HEIGHT + AXIS_EXTRA;
export const TOOLTIP_OFFSET = 12;

// Palette backed by CSS custom properties — follows light/dark theme.
export const CHART_COLORS = Array.from(
  { length: 8 },
  (_, i) => `hsl(var(--chart-${i + 1}))`,
);

export const MAX_STRING_VALUES = 10;
export const OTHER_COLOR = "hsl(var(--muted-foreground) / 0.4)";
export const BOOL_COLOR = CHART_COLORS[CHART_COLORS.length - 1];
export const lineChartTheme: typeof lightTheme = {
  ...lightTheme,
  colors: CHART_COLORS,
};

export const floatAccessors = {
  xAccessor: (d: FloatDatum) => d.timestamp,
  yAccessor: (d: FloatDatum) => d.value,
};

export const boolAccessors = {
  xAccessor: (d: BoolDatum) => d.timestamp,
  yAccessor: (d: BoolDatum) => d.value,
};

export const legendStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "4px 16px",
  paddingLeft: MARGIN.left,
  paddingBottom: 0,
  paddingTop: 12,
};

export const legendItemStyle = {
  display: "flex",
  alignItems: "center" as const,
  gap: 6,
  fontSize: 12,
};

export const legendLabelStyle = {
  color: "hsl(var(--muted-foreground))",
};

/** Names the series a legend's swatches belong to, where those swatches stand
 *  for values rather than series (the string panel). Carries the row, so it
 *  reads a step above the values it heads. */
export const legendSeriesLabelStyle = {
  ...legendItemStyle,
  color: "hsl(var(--foreground))",
  fontWeight: 500,
};
