import { Cpu } from "lucide-react";
import { DASH, GlyphFrame, useGlyphLabel } from "./glyph-kit";
import type { StandardFleetGlyphProps } from "./types";

/** A device of no registered type: a neutral dashed chip — "a device, we do
 *  not know what". */
export function OtherFleetGlyph({ device }: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  return (
    <GlyphFrame label={label} state="other">
      <rect
        x={6}
        y={6}
        width={36}
        height={36}
        rx={8}
        strokeWidth={1.5}
        strokeDasharray={DASH}
        className="fill-none stroke-border"
      />
      <Cpu
        x={13}
        y={13}
        width={22}
        height={22}
        strokeWidth={1.5}
        className="text-muted-foreground"
      />
    </GlyphFrame>
  );
}
