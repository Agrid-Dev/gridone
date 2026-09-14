import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Pt } from "../types";
import { clientToSvg, useSvgDrag } from "./useSvgDrag";

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
/** Scale change per wheel pixel, as an exponent so steps compound evenly. */
const WHEEL_SENSITIVITY = 0.002;
/** Pixels one wheel "line" or "page" stands for, when the browser reports
 *  those instead of pixels. */
const LINE_PX = 16;
const PAGE_PX = 40 * LINE_PX;
/** Client px a press may wander before it becomes a pan rather than a click. */
const PAN_THRESHOLD = 3;

type View = { x: number; y: number; scale: number };

const FIT: View = { x: 0, y: 0, scale: 1 };

const clampScale = (scale: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** The view scaled by `k` about `p`, so the content under `p` stays put. */
const zoomAbout = (v: View, p: Pt, k: number): View => {
  const scale = clampScale(v.scale * k);
  const kk = scale / v.scale;
  return { scale, x: p.x - (p.x - v.x) * kk, y: p.y - (p.y - v.y) * kk };
};

/**
 * Pan and zoom for a diagram canvas: drag pans, ctrl or cmd with the wheel
 * zooms about the cursor (a trackpad pinch arrives that way), two fingers
 * pinch, a double click fits again. A plain wheel is left to the page, so
 * a plate embedded in a scrolling page does not trap the scroll. The
 * transform goes on a group inside the svg, never on the viewBox, so the
 * root's screen transform (and every `clientToSvg` reading, including the
 * drag deltas) stays fixed while the content moves. The pan starts only
 * after a short travel, so a click on a symbol is still a click. The wheel
 * listener is attached by hand because React registers `wheel` as passive,
 * which would let the page scroll under the zoom.
 */
export function useViewport() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(FIT);
  const drag = useSvgDrag({
    threshold: PAN_THRESHOLD,
    onMove: (_p, delta) =>
      setView((v) => ({ ...v, x: v.x + delta.x, y: v.y + delta.y })),
  });
  /** Pointers down on the canvas, by id, in svg units; two make a pinch. */
  const pointers = useRef(new Map<number, Pt>());

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = clientToSvg(svg, e.clientX, e.clientY);
      const px =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? LINE_PX
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? PAGE_PX
            : 1;
      setView((v) =>
        zoomAbout(v, p, Math.exp(-e.deltaY * px * WHEEL_SENSITIVITY)),
      );
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const pinch = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const before = [...pointers.current.values()];
    pointers.current.set(e.pointerId, clientToSvg(svg, e.clientX, e.clientY));
    const after = [...pointers.current.values()];
    if (before.length !== 2 || after.length !== 2) return;
    const mid = (pts: Pt[]): Pt => ({
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    });
    const span = (pts: Pt[]) =>
      Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const from = mid(before);
    const to = mid(after);
    const k = span(before) ? span(after) / span(before) : 1;
    setView((v) => {
      const zoomed = zoomAbout(v, from, k);
      return {
        ...zoomed,
        x: zoomed.x + to.x - from.x,
        y: zoomed.y + to.y - from.y,
      };
    });
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      pointers.current.set(
        e.pointerId,
        clientToSvg(e.currentTarget, e.clientX, e.clientY),
      );
      if (pointers.current.size === 1) {
        drag.onPointerDown(e);
        return;
      }
      // A second finger turns the pan into a pinch: the drag lets go of the
      // first one and both are followed here.
      drag.cancel();
      for (const id of pointers.current.keys()) {
        e.currentTarget.setPointerCapture(id);
      }
    },
    [drag],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (pointers.current.has(e.pointerId)) pinch(e);
    },
    [pinch],
  );
  const onPointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  }, []);

  return {
    svgRef,
    handle: {
      style: drag.style,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick: () => setView(FIT),
    },
    transform: `translate(${view.x} ${view.y}) scale(${view.scale})`,
  };
}
