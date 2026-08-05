import { FC, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { FloorRow } from "./rollup";

const LAYER_HEIGHT = 98;
const MAX_STACK_SPREAD = 120;
const MAX_LAYER_GAP = 26;
const MIN_LAYER_GAP = 12;
const MIN_FILL_OPACITY = 0.08;
const MAX_FILL_OPACITY = 0.24;
const MIN_STROKE_OPACITY = 0.42;
const MAX_STROKE_OPACITY = 0.75;
const MIN_MARKER_OPACITY = 0.55;
const MAX_MARKER_OPACITY = 1;

/**
 * Draws the building floors as an isometric stack. The layer gap shrinks for
 * taller buildings so the diagram stays compact while retaining one shape per
 * real floor.
 */
export const FloorStackDiagram: FC<{ rows: FloorRow[] }> = ({ rows }) => {
  const { t } = useTranslation("home");
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const visualRows = [...rows].reverse().map((row, index) => ({
    ...row,
    colors: layerColors(index, rows.length),
    spreadOffset: layerSpreadOffset(index, rows.length),
  }));
  const gap = Math.max(
    MIN_LAYER_GAP,
    Math.min(MAX_LAYER_GAP, MAX_STACK_SPREAD / Math.max(rows.length - 1, 1)),
  );
  const lastOffset = (rows.length - 1) * gap;
  const viewBoxHeight = LAYER_HEIGHT + lastOffset + 10;

  return (
    <div className="grid items-center gap-5 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-3">
      <svg
        role="img"
        aria-label={t("zonesByLevel.diagramLabel")}
        viewBox={`0 0 284 ${viewBoxHeight}`}
        className="mx-auto h-auto w-full max-w-80 overflow-visible"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <path
          d={floorPath(lastOffset + 8)}
          fill="hsl(var(--muted))"
          stroke="hsl(var(--border))"
          strokeWidth="1"
        />
        {visualRows.map(({ floor, colors, spreadOffset }, index) => (
          <path
            key={floor.id}
            data-floor-id={floor.id}
            d={floorPath(index * gap)}
            fill={colors.fill}
            stroke={colors.stroke}
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
            onClick={() => navigate(`/assets/${floor.id}`)}
            className="cursor-pointer transition-transform duration-300 ease-out hover:brightness-95"
            style={{
              transform: expanded
                ? `translateY(${spreadOffset}px)`
                : "translateY(0)",
            }}
          />
        ))}
      </svg>

      <ul
        aria-label={t("zonesByLevel.diagramLegend")}
        className="grid min-w-32 grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-1"
      >
        {visualRows.map(({ floor, zoneCount, colors }) => (
          <li key={floor.id}>
            <Link
              to={`/assets/${floor.id}`}
              className="group flex items-center gap-2.5 text-sm font-medium text-foreground"
            >
              <span
                aria-hidden="true"
                data-floor-marker={floor.id}
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: colors.marker }}
              />
              <span className="group-hover:text-primary group-hover:underline">
                {floor.name}{" "}
                <span className="tabular-nums text-muted-foreground">
                  ({zoneCount})
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** A softly rounded diamond matching the isometric floor plate. */
function floorPath(offset: number): string {
  return [
    `M 14 ${50 + offset}`,
    `L 132 ${6 + offset}`,
    `Q 142 ${2 + offset} 152 ${6 + offset}`,
    `L 270 ${50 + offset}`,
    `L 152 ${94 + offset}`,
    `Q 142 ${98 + offset} 132 ${94 + offset}`,
    "Z",
  ].join(" ");
}

/** Gradually deepens the primary color from the top floor to the ground. */
function layerColors(index: number, count: number) {
  const progress = count === 1 ? 0.5 : index / (count - 1);
  const color = (min: number, max: number) =>
    `hsl(var(--primary) / ${(min + (max - min) * progress).toFixed(2)})`;

  return {
    fill: color(MIN_FILL_OPACITY, MAX_FILL_OPACITY),
    stroke: color(MIN_STROKE_OPACITY, MAX_STROKE_OPACITY),
    marker: color(MIN_MARKER_OPACITY, MAX_MARKER_OPACITY),
  };
}

/** Spreads layers around the stack centre without growing tall stacks too far. */
function layerSpreadOffset(index: number, count: number): number {
  const centre = (count - 1) / 2;
  const step = Math.min(8, 20 / Math.max(count - 1, 1));
  return (index - centre) * step;
}
