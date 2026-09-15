import type { ReactNode } from "react";
import { useViewport } from "./hooks/useViewport";

type PidDiagramProps = {
  /** viewBox width in diagram units */
  width?: number;
  /** viewBox height in diagram units */
  height?: number;
  children: ReactNode;
};

/**
 * Root SVG canvas for a P&ID / SCADA screen.
 * All child symbols are positioned in the same fixed coordinate space;
 * the whole diagram scales to fit its container, then pans by drag and
 * zooms with the wheel.
 */
export function PidDiagram({
  width = 2000,
  height = 1080,
  children,
}: PidDiagramProps) {
  const { svgRef, handle, transform } = useViewport();
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full bg-synoptic-plate"
      {...handle}
    >
      <g transform={transform}>{children}</g>
    </svg>
  );
}
