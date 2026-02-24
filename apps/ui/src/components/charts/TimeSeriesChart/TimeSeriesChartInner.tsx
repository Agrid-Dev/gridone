import type { TimeSeriesChartProps } from "./types";
import { FloatScaleContext } from "./FloatScaleContext";
import { TooltipContent } from "./TooltipContent";
import { panelRegistry } from "./panels/registry";
import { usePanels } from "./usePanels";
import { useChartTooltip } from "./useChartTooltip";

export function TimeSeriesChartInner({
  timestamps,
  lineSeries = [],
  lineValues = {},
  booleanSeries = [],
  booleanValues = {},
  stringSeries = [],
  stringValues = {},
  lineHeight,
  categoricalHeight,
  width,
}: TimeSeriesChartProps & { width: number }) {
  const panels = usePanels({
    lineSeries,
    lineValues,
    booleanSeries,
    booleanValues,
    stringSeries,
    stringValues,
    lineHeight,
    categoricalHeight,
  });

  const {
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
  } = useChartTooltip({ timestamps, width, panels });

  if (width <= 0) return null;

  return (
    <FloatScaleContext.Provider value={floatScaleCtx}>
      <div
        ref={containerRef}
        style={{ width, position: "relative" }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {/* Panel registry map */}
        {panels.map((entry, idx) => {
          const Component = panelRegistry[entry.type];
          return (
            <Component
              key={entry.key}
              entry={entry}
              timestamps={timestamps}
              width={width}
              isLast={idx === panels.length - 1}
            />
          );
        })}

        {/* Shared vertical crosshair */}
        {cursorX !== null && (
          <div
            style={{
              position: "absolute",
              left: cursorX,
              top: 0,
              bottom: 0,
              width: 1,
              pointerEvents: "none",
              backgroundColor: "hsl(var(--foreground) / 0.2)",
            }}
          />
        )}

        {/* Unified tooltip */}
        {cursorX !== null &&
          cursorY !== null &&
          hoveredIdx !== null &&
          tooltipRows && (
            <div
              className="bg-popover text-popover-foreground rounded-md border px-3 py-2 shadow-md"
              style={{
                position: "absolute",
                left: tooltipLeft,
                top: tooltipTop,
                pointerEvents: "none",
                zIndex: 10,
                whiteSpace: "nowrap",
              }}
            >
              <TooltipContent
                timestamp={timestamps[hoveredIdx]}
                rows={tooltipRows}
              />
            </div>
          )}
      </div>
    </FloatScaleContext.Provider>
  );
}
