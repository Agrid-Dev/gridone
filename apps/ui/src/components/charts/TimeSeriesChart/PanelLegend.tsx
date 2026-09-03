import type { FC } from "react";

import type { Series } from "./types";
import {
  CHART_COLORS,
  legendStyle,
  legendItemStyle,
  legendLabelStyle,
} from "./constants";
import { LegendSwatch } from "./LegendSwatch";

/** The legend band above a panel whose swatches stand for series — one entry
 *  per series, coloured by its position, shared by the line and bar panels
 *  which differ only in the mark the swatch previews. */
export const PanelLegend: FC<{
  series: Series[];
  variant: "line" | "area";
}> = ({ series, variant }) => (
  <div style={legendStyle}>
    {series.map((s, i) => (
      <div key={s.key} style={legendItemStyle}>
        <LegendSwatch
          color={CHART_COLORS[i % CHART_COLORS.length]}
          variant={variant}
          dash={s.dash}
        />
        <span style={legendLabelStyle}>{s.label}</span>
      </div>
    ))}
  </div>
);
