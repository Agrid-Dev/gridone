import type { ReactNode } from "react";

export type DepthItem = {
  id: string;
  /** From `depthKey`; lower is painted first. */
  depth: number;
  node: ReactNode;
};

/** Paints `items` back to front. SVG has no z-index: document order is
 *  draw order, so the sort is the whole of the depth handling. */
export function DepthOrdered({ items }: { items: DepthItem[] }) {
  const ordered = [...items].sort((a, b) => a.depth - b.depth);
  return (
    <>
      {ordered.map((item) => (
        <g key={item.id}>{item.node}</g>
      ))}
    </>
  );
}
