import type { MutableRefObject } from "react";
import { useContext } from "react";
import { DataContext } from "@visx/xychart";

/** Renders nothing — just captures the live yScale from visx DataContext into a ref. */
export function ScaleCapture({
  yScaleRef,
}: {
  yScaleRef: MutableRefObject<((v: number) => number) | null>;
}) {
  const { yScale } = useContext(DataContext);
  yScaleRef.current = yScale as ((v: number) => number) | null;
  return null;
}
