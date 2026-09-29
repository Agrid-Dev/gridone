import { createContext, useContext } from "react";
import { legendStyle } from "./constants";

/** Width the legend band keeps clear at its right end for the drag handle
 *  a reorderable chart places there. */
export const HANDLE_GUTTER = 40;

/** True while the chart shows drag handles, so every legend band leaves the
 *  gutter clear instead of running its last label under the handle. */
export const LegendGutterContext = createContext(false);

/** The legend band's style, with the handle gutter reserved when shown. */
export function useLegendStyle(): typeof legendStyle & {
  paddingRight?: number;
} {
  const gutter = useContext(LegendGutterContext);
  return gutter ? { ...legendStyle, paddingRight: HANDLE_GUTTER } : legendStyle;
}
