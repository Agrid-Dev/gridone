import { useEffect, useRef, useState } from "react";
import { clientToSvg, useSvgDrag } from "./useSvgDrag";

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
/** Scale change per wheel pixel, as an exponent so steps compound evenly. */
const WHEEL_SENSITIVITY = 0.002;
/** Pixels one wheel "line" stands for, when the browser reports lines. */
const LINE_PX = 16;
/** Client px a press may wander before it becomes a pan rather than a click. */
const PAN_THRESHOLD = 3;

type View = { x: number; y: number; scale: number };

const FIT: View = { x: 0, y: 0, scale: 1 };

/**
 * Pan and zoom for a diagram canvas: drag pans, the wheel zooms about the
 * cursor, a double click fits again. The transform goes on a group inside
 * the svg, never on the viewBox, so the root's screen transform (and every
 * `clientToSvg` reading, including the drag deltas) stays fixed while the
 * content moves. The pan starts only after a short travel, so a click on a
 * symbol is still a click. The wheel listener is attached by hand because
 * React registers `wheel` as passive, which would let the page scroll under
 * the zoom.
 */
export function useViewport() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(FIT);
  const drag = useSvgDrag({
    threshold: PAN_THRESHOLD,
    onMove: (_p, delta) =>
      setView((v) => ({ ...v, x: v.x + delta.x, y: v.y + delta.y })),
  });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = clientToSvg(svg, e.clientX, e.clientY);
      const px = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_PX : 1;
      setView((v) => {
        const scale = Math.min(
          MAX_SCALE,
          Math.max(
            MIN_SCALE,
            v.scale * Math.exp(-e.deltaY * px * WHEEL_SENSITIVITY),
          ),
        );
        const k = scale / v.scale;
        return { scale, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  return {
    svgRef,
    handle: { ...drag, onDoubleClick: () => setView(FIT) },
    transform: `translate(${view.x} ${view.y}) scale(${view.scale})`,
  };
}
