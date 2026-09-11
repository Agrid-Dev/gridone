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
  onEnd?: (p: Pt) => void;
};

/**
 * SVG-space dragging. Returns a pointerDown handler to spread on any SVG element:
 * `<g onPointerDown={dragHandler}>`. Coordinates are in viewBox units.
 * A drag ends on pointer up or cancel, and is dropped when the component unmounts.
 */
export function useSvgDrag({ onStart, onMove, onEnd }: DragHandlers) {
  const handlers = useRef({ onStart, onMove, onEnd });
  handlers.current = { onStart, onMove, onEnd };
  const detach = useRef<() => void>(() => {});

  useEffect(() => () => detach.current(), []);

  return useCallback((e: ReactPointerEvent<SVGElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as SVGGraphicsElement;
    const svg = el.ownerSVGElement ?? (el as unknown as SVGSVGElement);
    const start = clientToSvg(svg, e.clientX, e.clientY);
    let last = start;
    handlers.current.onStart?.(start);
    const move = (ev: PointerEvent) => {
      const p = clientToSvg(svg, ev.clientX, ev.clientY);
      handlers.current.onMove(p, { x: p.x - last.x, y: p.y - last.y }, start);
      last = p;
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      detach.current = () => {};
    };
    const up = (ev: PointerEvent) => {
      stop();
      handlers.current.onEnd?.(clientToSvg(svg, ev.clientX, ev.clientY));
    };
    detach.current();
    detach.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    e.stopPropagation();
    e.preventDefault();
  }, []);
}
