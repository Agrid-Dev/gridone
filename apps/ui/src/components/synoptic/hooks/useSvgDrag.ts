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
export function useSvgDrag({ onStart, onMove, onEnd, onCancel }: DragHandlers) {
  const handlers = useRef({ onStart, onMove, onEnd, onCancel });
  handlers.current = { onStart, onMove, onEnd, onCancel };
  /** Cancels the drag in progress, if any. */
  const cancelActive = useRef<() => void>(() => {});

  useEffect(() => () => cancelActive.current(), []);

  const onPointerDown = useCallback((e: ReactPointerEvent<SVGElement>) => {
    if (e.button !== 0) return;
    cancelActive.current();
    const id = e.pointerId;
    const el = e.currentTarget as SVGGraphicsElement;
    const svg = el.ownerSVGElement ?? (el as unknown as SVGSVGElement);
    el.setPointerCapture(id);
    const start = clientToSvg(svg, e.clientX, e.clientY);
    let last = start;
    handlers.current.onStart?.(start);

    const teardown = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
      cancelActive.current = () => {};
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const p = clientToSvg(svg, ev.clientX, ev.clientY);
      handlers.current.onMove(p, { x: p.x - last.x, y: p.y - last.y }, start);
      last = p;
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      teardown();
      handlers.current.onEnd?.(clientToSvg(svg, ev.clientX, ev.clientY));
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      cancelActive.current();
    };
    cancelActive.current = () => {
      teardown();
      handlers.current.onCancel?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    e.stopPropagation();
    e.preventDefault();
  }, []);

  return { onPointerDown, style: HANDLE_STYLE };
}

const HANDLE_STYLE = { touchAction: "none" } as const;
