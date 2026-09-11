import type { ReactNode } from "react";

type PidDiagramProps = {
  /** viewBox width in diagram units */
  width?: number;
  /** viewBox height in diagram units */
  height?: number;
  children: ReactNode;
};

/**
 * Root SVG canvas for a P&ID / SCADA screen.
 * All child symbols are positioned in the same fixed coordinate space
 * and the whole diagram scales responsively with its container.
 */
export function PidDiagram({
  width = 2000,
  height = 1080,
  children,
}: PidDiagramProps) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full bg-synoptic-plate"
    >
      {children}
    </svg>
  );
}
