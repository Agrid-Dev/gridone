import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Pt } from "../types";

/** Convert client (mouse) coordinates into the SVG viewBox coordinate space. */
export function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Pt {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

type DragHandlers = {
  /** Client px the pointer must travel before the drag starts. Until then
   *  the pointer is not captured, so a plain click still reaches its
   *  target. Default 0: the drag starts on pointerdown. */
  threshold?: number;
  onStart?: (p: Pt) => void;
  /** Called on every move with the current point, the delta since last move, and the start point. */
  onMove: (p: Pt, delta: Pt, start: Pt) => void;
  /** The pointer was released: commit. */
  onEnd?: (p: Pt) => void;
  /** The gesture was taken away (browser cancel, a second pointer starting a
   *  new drag, unmount): revert, nothing is committed. */
  onCancel?: () => void;
};

/**
 * SVG-space dragging. Returns props to spread on the handle element:
 * `<g {...drag}>`. Coordinates are in viewBox units. The pointer that
 * started the drag is captured and is the only one that moves or ends it;
 * `touch-action: none` on the handle keeps the browser from claiming the
 * gesture for scrolling.
 */
export function useSvgDrag({
  threshold = 0,
  onStart,
  onMove,
  onEnd,
  onCancel,
}: DragHandlers) {
  const handlers = useRef({ onStart, onMove, onEnd, onCancel });
  handlers.current = { onStart, onMove, onEnd, onCancel };
  /** Cancels the drag in progress, if any. */
  const cancelActive = useRef<() => void>(() => {});

  useEffect(() => () => cancelActive.current(), []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGElement>) => {
      if (e.button !== 0) return;
      cancelActive.current();
      const id = e.pointerId;
      const el = e.currentTarget as SVGGraphicsElement;
      const svg = el.ownerSVGElement ?? (el as unknown as SVGSVGElement);
      const down = { x: e.clientX, y: e.clientY };
      let started = false;
      let start = clientToSvg(svg, down.x, down.y);
      let last = start;

      const begin = (clientX: number, clientY: number) => {
        started = true;
        el.setPointerCapture(id);
        start = clientToSvg(svg, clientX, clientY);
        last = start;
        handlers.current.onStart?.(start);
      };
      // A drag that starts on the press owns it, so the browser's own
      // response to the press (focus, selection, the compatibility mouse
      // events) is cancelled. A press that has to travel first stays a
      // plain press until it does, so clicks and double clicks are left
      // exactly as the browser makes them.
      if (threshold === 0) {
        begin(down.x, down.y);
        e.preventDefault();
      }

      const teardown = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
        cancelActive.current = () => {};
      };
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        if (!started) {
          if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < threshold)
            return;
          begin(down.x, down.y);
        }
        const p = clientToSvg(svg, ev.clientX, ev.clientY);
        handlers.current.onMove(p, { x: p.x - last.x, y: p.y - last.y }, start);
        last = p;
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        teardown();
        if (started) {
          handlers.current.onEnd?.(clientToSvg(svg, ev.clientX, ev.clientY));
        }
      };
      const cancel = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        cancelActive.current();
      };
      cancelActive.current = () => {
        teardown();
        if (started) handlers.current.onCancel?.();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      e.stopPropagation();
    },
    [threshold],
  );

  /** Lets go of the drag in progress, reverting it, for a caller that
   *  takes the gesture over (a second finger starting a pinch). */
  const cancel = useCallback(() => cancelActive.current(), []);

  return { onPointerDown, style: HANDLE_STYLE, cancel };
}

const HANDLE_STYLE = { touchAction: "none" } as const;
