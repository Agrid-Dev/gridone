import type { FC } from "react";
import { symbolSchemas } from "@gridone/sdk";
import { cn } from "@/lib/utils";
import { project } from "../projection";
import { Collector } from "./Collector";
import type { CollectorProps } from "./ports";
import { SynopticSymbol } from "./SynopticSymbol";

/** Room around the footprint, in cells, for what a glyph draws past it
 *  (an actuator's stem, a vent). */
const MARGIN = 0.45;
/** A collector has no footprint of its own: its thumbnail is a short bar. */
const BAR: CollectorProps = { axis: "x", length: 2, ports: {} };

/**
 * A type's plan glyph, as the sheet draws it, fitted to `height` px: the
 * key of a plate's legend, a row of the editor's library. Nothing for a
 * type the bundled registry does not know.
 */
export const SymbolThumb: FC<{
  type: string;
  height?: number;
  className?: string;
}> = ({ type, height = 26, className }) => {
  const collector = type === "collector";
  const footprint = collector
    ? { w: BAR.length, d: 1 }
    : symbolSchemas[type]?.["x-footprint"];
  if (!footprint) return null;
  const a = project("flat", -MARGIN, -MARGIN, 0);
  const b = project("flat", footprint.w + MARGIN, footprint.d + MARGIN, 0);
  const vw = b.x - a.x;
  const vh = b.y - a.y;
  return (
    <svg
      aria-hidden
      viewBox={`${a.x} ${a.y} ${vw} ${vh}`}
      height={height}
      width={Math.round((height * vw) / vh)}
      className={cn("shrink-0 rounded bg-synoptic-plate", className)}
    >
      {collector ? (
        <Collector projection="flat" origin={{ x: 0, y: 0 }} shape={BAR} />
      ) : (
        <SynopticSymbol
          type={type}
          projection="flat"
          origin={{ x: 0, y: 0 }}
          showLabel={false}
        />
      )}
    </svg>
  );
};
