import { type MutableRefObject, type RefObject, createContext } from "react";

export type FloatScaleContextType = {
  panelRef: RefObject<HTMLDivElement | null>;
  yScaleRef: MutableRefObject<((v: number) => number) | null>;
};

export const FloatScaleContext = createContext<FloatScaleContextType | null>(
  null,
);
