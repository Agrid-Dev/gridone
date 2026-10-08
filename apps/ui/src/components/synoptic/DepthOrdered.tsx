import { useContext, useMemo, type ReactNode } from "react";
import {
  declutter,
  TextScaleContext,
  TextShiftContext,
  type Drawing,
  type TextFootprint,
} from "./legibility";
import type { Box } from "./placement";

export type DepthItem = {
  id: string;
  /** From `depthKey`; lower is painted first. */
  depth: number;
  node: ReactNode;
  /** Set on text: it is held legible when the plate is zoomed out. */
  text?: TextFootprint;
};

const NO_SHIFT = { x: 0, y: 0 };

/** Paints `items` back to front. SVG has no z-index: document order is
 *  draw order, so the sort is the whole of the depth handling. Text is
 *  grown about its anchor by the scale the canvas holds it at; text with
 *  no room there is moved nearby, and the text that cannot move is
 *  hidden. */
export function DepthOrdered({
  items,
  frame,
  drawing,
}: {
  items: DepthItem[];
  /** The plate's frame, in the items' coordinates: grown text past it
   *  would be clipped, so it gives way. */
  frame?: Box;
  /** The bodies and runs grown text gives way to rather than cover. */
  drawing?: Drawing;
}) {
  const k = useContext(TextScaleContext);
  const ordered = useMemo(
    () => [...items].sort((a, b) => a.depth - b.depth),
    [items],
  );
  const { hidden, held } = useMemo(
    () => declutter(items, k, frame, drawing),
    [items, k, frame, drawing],
  );
  return (
    <>
      {ordered.map((item) => {
        const text = item.text;
        if (!text || k === 1) return <g key={item.id}>{item.node}</g>;
        const { x, y } = text.anchor;
        const h = held.get(item.id);
        const shift = h?.shift ?? NO_SHIFT;
        const off = hidden.has(item.id);
        return (
          <g key={item.id}>
            {h?.tether && (
              <line
                x1={h.tether[0].x}
                y1={h.tether[0].y}
                x2={h.tether[1].x}
                y2={h.tether[1].y}
                strokeWidth={1}
                className="stroke-muted-foreground"
                data-leader="tether"
              />
            )}
            <TextShiftContext.Provider value={shift}>
              <g
                transform={`translate(${shift.x + x} ${shift.y + y}) scale(${k}) translate(${-x} ${-y})`}
                display={off ? "none" : undefined}
                data-text-hidden={off || undefined}
                data-text-moved={h ? "" : undefined}
              >
                {item.node}
              </g>
            </TextShiftContext.Provider>
          </g>
        );
      })}
    </>
  );
}
