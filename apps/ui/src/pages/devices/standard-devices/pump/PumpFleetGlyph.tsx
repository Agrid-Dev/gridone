import { isPump, readPumpAttributes } from "@/lib/devices";
import { GlyphFrame, useGlyphLabel } from "../glyph-kit";
import type { StandardFleetGlyphProps } from "../types";
import { PumpGlyph, pumpGlyphBounds } from "./PumpGlyph";
import { pumpState } from "./state";

const R = 40;
const BOUNDS = pumpGlyphBounds(0, 0, R);

/** The pump's P&ID glyph fitted to the slot, its viewBox taken from the
 *  drawing's own bounds so the motor is never clipped. Static: the impeller
 *  turns on the device page, not in a grid. */
export function PumpFleetGlyph({ device }: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  const state = isPump(device)
    ? pumpState(readPumpAttributes(device))
    : "unknown";

  return (
    <GlyphFrame label={label} state={state}>
      <svg
        width={48}
        height={48}
        viewBox={`${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.w} ${BOUNDS.h}`}
      >
        <PumpGlyph
          cx={0}
          cy={0}
          r={R}
          state={state}
          spinning={false}
          title=""
        />
      </svg>
    </GlyphFrame>
  );
}
