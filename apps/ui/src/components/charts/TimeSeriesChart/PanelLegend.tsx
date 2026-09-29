import type { FC } from "react";

import type { Series } from "./types";
import { CHART_COLORS, legendItemStyle, legendLabelStyle } from "./constants";
import { LegendSwatch } from "./LegendSwatch";
import { useLegendStyle } from "./LegendGutterContext";
import { SeriesLabel } from "./SeriesLabel";

/** The legend band above a panel whose swatches stand for series — one entry
 *  per series, coloured by its position in the chart's palette (offset by the
 *  series drawn on the panels above), shared by the line and bar panels which
 *  differ only in the mark the swatch previews. */
export const PanelLegend: FC<{
  series: Series[];
  variant: "line" | "area";
  colorOffset?: number;
}> = ({ series, variant, colorOffset = 0 }) => {
  const legendStyle = useLegendStyle();
  return (
    <div style={legendStyle}>
      {series.map((s, i) => (
        <div key={s.key} style={legendItemStyle}>
          <LegendSwatch
            color={CHART_COLORS[(colorOffset + i) % CHART_COLORS.length]}
            variant={variant}
            dash={s.dash}
          />
          <span style={legendLabelStyle}>
            <SeriesLabel series={s} />
          </span>
        </div>
      ))}
    </div>
  );
};
