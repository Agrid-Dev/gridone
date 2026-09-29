import { type MutableRefObject, type RefObject, createContext } from "react";

/** What the tooltip needs of a float panel to find the series nearest the
 *  cursor: the panel's box and its live y-scale. */
export type FloatScaleRefs = {
  panelRef: RefObject<HTMLDivElement>;
  yScaleRef: MutableRefObject<((v: number) => number) | null>;
};

export type FloatScaleContextType = {
  /** The refs of the float panel with this key — one pair per panel, since
   *  each unit panel has a scale of its own. */
  scalesFor: (panelKey: string) => FloatScaleRefs;
};

export const FloatScaleContext = createContext<FloatScaleContextType | null>(
  null,
);
