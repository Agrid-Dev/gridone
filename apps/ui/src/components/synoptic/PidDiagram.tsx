import type { ReactNode, RefObject } from "react";
import {
  useViewport,
  type View,
  type ViewportController,
} from "./hooks/useViewport";

/** Which touch gestures the browser keeps. `pan-y` leaves one-finger
 *  vertical swipes to the page, so a plate embedded in a scrolling page
 *  does not trap the scroll; `none` gives every gesture to the canvas, for
 *  a view that fills the screen. */
export type CanvasTouchAction = "pan-y" | "none";

type PidDiagramProps = {
  /** viewBox width in diagram units */
  width?: number;
  /** viewBox height in diagram units */
  height?: number;
  touchAction?: CanvasTouchAction;
  /** Receives the controls a toolbar drives the view with. */
  controller?: RefObject<ViewportController | null>;
  onViewChange?: (view: View) => void;
  children: ReactNode;
};

/**
 * Root SVG canvas for a P&ID / SCADA screen.
 * All child symbols are positioned in the same fixed coordinate space;
 * the whole diagram scales to fit its container, then pans by drag and
 * zooms with the wheel, a pinch or the controller. Text is not
 * selectable, since a press that becomes a pan would otherwise start a
 * selection.
 */
export function PidDiagram({
  width = 2000,
  height = 1080,
  touchAction = "pan-y",
  controller,
  onViewChange,
  children,
}: PidDiagramProps) {
  const { svgRef, handle, transform } = useViewport({
    width,
    height,
    controller,
    onViewChange,
  });
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full select-none bg-synoptic-plate"
      style={{ touchAction }}
      {...handle}
    >
      <g transform={transform}>{children}</g>
    </svg>
  );
}
