import {
  isElectricityMeter,
  readElectricityMeterAttributes,
} from "@/lib/devices";
import { Casing, GlyphFrame, useGlyphLabel } from "../glyph-kit";
import type { StandardFleetGlyphProps } from "../types";

/** Electricity meter: the cabinet with its register window and a bolt. The
 *  number on the card is the reading; the glyph only says "meter", its bolt
 *  solid while it reports. */
export function ElectricityMeterFleetGlyph({
  device,
}: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  const reporting =
    isElectricityMeter(device) &&
    readElectricityMeterAttributes(device).activePower != null;

  return (
    <GlyphFrame label={label} state={reporting ? "reporting" : "unknown"}>
      <Casing x={9} y={4} width={30} height={40} rx={3} unknown={!reporting} />
      <rect
        x={13}
        y={8.5}
        width={22}
        height={8}
        rx={1}
        strokeWidth={1}
        className="fill-card stroke-border"
      />
      {[17, 21.5, 26, 30.5].map((x) => (
        <line
          key={x}
          x1={x}
          y1={10.5}
          x2={x}
          y2={14.5}
          strokeWidth={1.5}
          className="stroke-muted-foreground"
        />
      ))}
      <path
        d="M26 20 L18 31 L23 31 L21 39 L30 27 L25 27 L27 20 Z"
        strokeWidth={1.25}
        strokeLinejoin="round"
        stroke="currentColor"
        fill={reporting ? "currentColor" : "none"}
        className={reporting ? "text-foreground" : "text-muted-foreground"}
      />
    </GlyphFrame>
  );
}
