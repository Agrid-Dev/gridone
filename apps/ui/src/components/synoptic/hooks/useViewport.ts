import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { Pt } from "../types";
import { clientToSvg, DRAG_THRESHOLD, useSvgDrag } from "./useSvgDrag";

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
/** Scale change per wheel pixel, as an exponent so steps compound evenly. */
const WHEEL_SENSITIVITY = 0.002;
/** Pixels one wheel "line" or "page" stands for, when the browser reports
 *  those instead of pixels. */
const LINE_PX = 16;
const PAGE_PX = 40 * LINE_PX;
/** The most one wheel event may move the zoom, in pixels of delta, so a
 *  page-mode notch or a flung trackpad stays one sensible step. */
const MAX_WHEEL_PX = 200;
/** What one press of a zoom button does. */
export const ZOOM_STEP = 1.25;

export type View = { x: number; y: number; scale: number };

const FIT: View = { x: 0, y: 0, scale: 1 };

const clampScale = (scale: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** The view scaled by `k` about `p`, so the content under `p` stays put. */
const zoomAbout = (v: View, p: Pt, k: number): View => {
  const scale = clampScale(v.scale * k);
  const kk = scale / v.scale;
  return { scale, x: p.x - (p.x - v.x) * kk, y: p.y - (p.y - v.y) * kk };
};

/** What a toolbar or a navigation panel may do to the view. Points are
 *  in the svg's viewBox units. */
export type ViewportController = {
  /** Scales by `k` about the centre of the canvas. */
  zoomBy: (k: number) => void;
  /** Back to the fitted view. */
  fit: () => void;
  /** Brings `p` to the centre of the canvas, at `scale` when given. */
  centerOn: (p: Pt, scale?: number) => void;
  /** The current scale, 1 being the fitted plate. */
  scale: () => number;
};

type ViewportOptions = {
  /** viewBox size, so the canvas knows its own centre. */
  width: number;
  height: number;
  controller?: RefObject<ViewportController | null>;
  onViewChange?: (view: View) => void;
};

/**
 * Pan and zoom for a diagram canvas: drag pans, the wheel zooms about the
 * cursor (a trackpad pinch arrives that way too), two fingers pinch, a
 * double click fits again. The wheel is the canvas's whether or not a
 * modifier is held: an operator reading a plate expects to zoom it, and
 * the page scrolls from outside the plate. The transform goes on a group
 * inside the svg, never on the viewBox, so the root's screen transform
 * (and every `clientToSvg` reading, including the drag deltas) stays fixed
 * while the content moves. The pan starts only after a short travel, so a
 * click on a symbol is still a click. The wheel listener is attached by
 * hand because React registers `wheel` as passive, which would let the
 * page scroll under the zoom.
 */
export function useViewport({
  width,
  height,
  controller,
  onViewChange,
}: ViewportOptions) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(FIT);
  const drag = useSvgDrag({
    threshold: DRAG_THRESHOLD,
    onMove: (_p, delta) =>
      setView((v) => ({ ...v, x: v.x + delta.x, y: v.y + delta.y })),
  });
  /** Pointers down on the canvas, by id, in svg units; two make a pinch. */
  const pointers = useRef(new Map<number, Pt>());
  /** Set once a pinch has taken the gesture over from the drag: the finger
   *  left down afterwards pans from here, since the drag is gone. */
  const pinched = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    onViewChange?.(view);
  }, [view, onViewChange]);

  useImperativeHandle(
    controller,
    () => ({
      zoomBy: (k) =>
        setView((v) => zoomAbout(v, { x: width / 2, y: height / 2 }, k)),
      fit: () => setView(FIT),
      centerOn: (p, scale) =>
        setView((v) => {
          const s = clampScale(scale ?? v.scale);
          return { scale: s, x: width / 2 - p.x * s, y: height / 2 - p.y * s };
        }),
      scale: () => viewRef.current.scale,
    }),
    [controller, width, height],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = clientToSvg(svg, e.clientX, e.clientY);
      const px =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? LINE_PX
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? PAGE_PX
            : 1;
      const delta = Math.max(
        -MAX_WHEEL_PX,
        Math.min(MAX_WHEEL_PX, e.deltaY * px),
      );
      setView((v) => zoomAbout(v, p, Math.exp(-delta * WHEEL_SENSITIVITY)));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const follow = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const before = [...pointers.current.values()];
    pointers.current.set(e.pointerId, clientToSvg(svg, e.clientX, e.clientY));
    const after = [...pointers.current.values()];
    if (before.length === 1 && after.length === 1 && pinched.current) {
      const dx = after[0].x - before[0].x;
      const dy = after[0].y - before[0].y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
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
      pinched.current = true;
      for (const id of pointers.current.keys()) {
        e.currentTarget.setPointerCapture(id);
      }
    },
    [drag],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (pointers.current.has(e.pointerId)) follow(e);
    },
    [follow],
  );
  const onPointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) pinched.current = false;
  }, []);

  return {
    svgRef,
    handle: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick: () => setView(FIT),
    },
    transform: `translate(${view.x} ${view.y}) scale(${view.scale})`,
  };
}
