import type { ReactNode } from "react";
import { COLORS, FONT, SymbolDefs } from "./theme";

type PidDiagramProps = {
  /** viewBox width in diagram units */
  width?: number;
  /** viewBox height in diagram units */
  height?: number;
  /** Canvas background (defaults to the dark SCADA navy). */
  background?: string;
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
  background = COLORS.bg,
  children,
}: PidDiagramProps) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        background,
        fontFamily: FONT,
      }}
    >
      <SymbolDefs />
      {children}
    </svg>
  );
}
