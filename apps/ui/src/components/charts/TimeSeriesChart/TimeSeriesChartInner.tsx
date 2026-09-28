import { useState } from "react";
import type { PanelEntry, TimeSeriesChartProps } from "./types";
import { FloatScaleContext } from "./FloatScaleContext";
import { SortablePanels } from "./SortablePanels";
import { TooltipContent } from "./TooltipContent";
import { panelRegistry } from "./panels/registry";
import { usePanels } from "./usePanels";
import { useChartTooltip } from "./useChartTooltip";

export function TimeSeriesChartInner({
  timestamps,
  lineSeries = [],
  lineValues = {},
  intSeries = [],
  intValues = {},
  booleanSeries = [],
  booleanValues = {},
  stringSeries = [],
  stringValues = {},
  numericMark,
  panelOrder,
  onPanelOrderChange,
  dragHandleLabel = (label) => label,
  lineHeight,
  categoricalHeight,
  width,
}: TimeSeriesChartProps & { width: number }) {
  // A panel on the move is not being read: the crosshair and tooltip hold
  // off until it is dropped.
  const [dragging, setDragging] = useState(false);
  const panels = usePanels({
    lineSeries,
    lineValues,
    intSeries,
    intValues,
    booleanSeries,
    booleanValues,
    stringSeries,
    stringValues,
    numericMark,
    panelOrder,
    lineHeight,
    categoricalHeight,
  });

  const {
    containerRef,
    tooltipRef,
    floatScales,
    handlePointerMove,
    handlePointerLeave,
    cursorX,
    cursorY,
    hoveredIdx,
    hoveredTime,
    tooltipRows,
    tooltipLeft,
    tooltipTop,
  } = useChartTooltip({ timestamps, width, panels });

  if (width <= 0) return null;

  const renderPanel = (entry: PanelEntry, idx: number) => {
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
  };

  const showCursor = cursorX !== null && !dragging;

  return (
    <FloatScaleContext.Provider value={floatScales}>
      <div
        ref={containerRef}
        style={{ width, position: "relative" }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {onPanelOrderChange ? (
          <SortablePanels
            panels={panels}
            onReorder={onPanelOrderChange}
            onDraggingChange={setDragging}
            handleLabel={dragHandleLabel}
          >
            {renderPanel}
          </SortablePanels>
        ) : (
          panels.map(renderPanel)
        )}

        {/* Shared vertical crosshair */}
        {showCursor && (
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
        {showCursor &&
          cursorY !== null &&
          hoveredIdx !== null &&
          hoveredTime !== null &&
          tooltipRows && (
            <div
              ref={tooltipRef}
              className="bg-popover text-popover-foreground rounded-md border px-3 py-2 shadow-md"
              style={{
                position: "absolute",
                left: tooltipLeft,
                top: tooltipTop,
                pointerEvents: "none",
                zIndex: 10,
                // Bounded by the chart so a long series label wraps instead of
                // overhanging — in a narrow tile no placement would fit it.
                maxWidth: width,
              }}
            >
              {/* The instant under the cursor, not the recorded point's own
                  timestamp — the rows report the values in force then. */}
              <TooltipContent timestamp={hoveredTime} rows={tooltipRows} />
            </div>
          )}
      </div>
    </FloatScaleContext.Provider>
  );
}
