import { isLiquidDetector, readLiquidDetectorAttributes } from "@/lib/devices";
import { DASH, GlyphFrame, useGlyphLabel } from "../glyph-kit";
import type { StandardFleetGlyphProps } from "../types";
import { liquidVerdict } from "./verdict";

/** Leak detector: the drop, filled when wet — the `LiquidDrop` shape on the
 *  glyph canvas, dashed while the probe has never reported. */
export function LiquidDetectorFleetGlyph({ device }: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  const verdict = isLiquidDetector(device)
    ? liquidVerdict(readLiquidDetectorAttributes(device))
    : null;
  const wet = verdict === "detected";
  const k = 1.6;

  return (
    <GlyphFrame label={label} state={verdict ?? "unknown"}>
      <path
        transform={`translate(4.8 3) scale(${k})`}
        d="M12 2.4 6.3 10a7.2 7.2 0 1 0 11.4 0Z"
        fill={wet ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.5 / k}
        strokeLinejoin="round"
        strokeDasharray={
          verdict
            ? undefined
            : DASH.split(" ")
                .map((n) => +n / k)
                .join(" ")
        }
        className={wet ? "text-water" : "text-muted-foreground"}
      />
    </GlyphFrame>
  );
}
