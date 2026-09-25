import { useContext, useMemo, type ReactNode } from "react";
import { declutter, TextScaleContext, type TextFootprint } from "./legibility";
import type { Box } from "./placement";

export type DepthItem = {
  id: string;
  /** From `depthKey`; lower is painted first. */
  depth: number;
  node: ReactNode;
  /** Set on text: it is held legible when the plate is zoomed out. */
  text?: TextFootprint;
};

/** Paints `items` back to front. SVG has no z-index: document order is
 *  draw order, so the sort is the whole of the depth handling. Text is
 *  grown about its anchor by the scale the canvas holds it at, and the
 *  text that no longer fits at that size is hidden. */
export function DepthOrdered({
  items,
  frame,
}: {
  items: DepthItem[];
  /** The plate's frame, in the items' coordinates: grown text past it
   *  would be clipped, so it gives way. */
  frame?: Box;
}) {
  const k = useContext(TextScaleContext);
  const ordered = useMemo(
    () => [...items].sort((a, b) => a.depth - b.depth),
    [items],
  );
  const hidden = useMemo(() => declutter(items, k, frame), [items, k, frame]);
  return (
    <>
      {ordered.map((item) => {
        const text = item.text;
        if (!text || k === 1) return <g key={item.id}>{item.node}</g>;
        const { x, y } = text.anchor;
        return (
          <g
            key={item.id}
            transform={`translate(${x} ${y}) scale(${k}) translate(${-x} ${-y})`}
            display={hidden.has(item.id) ? "none" : undefined}
            data-text-hidden={hidden.has(item.id) || undefined}
          >
            {item.node}
          </g>
        );
      })}
    </>
  );
}
