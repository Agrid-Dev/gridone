import { useTranslation } from "react-i18next";
import { isPump, readPumpAttributes } from "@/lib/devices";
import { cn } from "@/lib/utils";
import { PumpGlyph, pumpGlyphBounds } from "./PumpGlyph";
import { PUMP_STATE_TEXT_CLASS, pumpState } from "./state";
import type { StandardFleetSummaryProps } from "../types";

const R = 42;
const BOUNDS = pumpGlyphBounds(0, 0, R);
const VIEW_BOX = `${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.w} ${BOUNDS.h}`;
const ASPECT = BOUNDS.w / BOUNDS.h;

/** Where the rotor centre sits down the glyph's height. The motor stands
 *  above the volute, so it is nowhere near the middle — roughly 0.69 — and a
 *  label centred on the box as a whole floats well above the rotor it names.
 *  Derived rather than measured, so it follows the drawing. */
const ROTOR_FRACTION = -BOUNDS.y / BOUNDS.h;

/** Rendered glyph height, in px. The width follows the drawing's own aspect,
 *  so the motor is never cropped to fit a guessed box. */
const HEIGHT = 64;

/** The fleet card's lead slot for a pump: the drawing plus its run state.
 *
 *  No reading. A pump's quantities — head, flow, speed, power — are different
 *  physical things with no shared unit, so picking one and printing it bare
 *  gives a figure that could mean any of four things.
 *
 *  The impeller never turns here. A grid of pumps all spinning at once is
 *  motion with nothing to say; the animation earns its place on the device
 *  page, where one pump is the subject. Running reads statically instead,
 *  from the filled volute. */
export function PumpFleetSummary({ device }: StandardFleetSummaryProps) {
  const { t } = useTranslation("standardDevices");
  if (!isPump(device)) return null;

  const state = pumpState(readPumpAttributes(device));
  const label = t(`pump.state.${state}`);

  return (
    <div className="flex items-center gap-2.5">
      <svg
        viewBox={VIEW_BOX}
        role="img"
        aria-label={`${t("pump.name")} — ${label}`}
        width={HEIGHT * ASPECT}
        height={HEIGHT}
        className="shrink-0"
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
      <span
        className={cn(
          "truncate text-sm leading-none",
          PUMP_STATE_TEXT_CLASS[state],
        )}
        style={{
          transform: `translateY(${(ROTOR_FRACTION - 0.5) * HEIGHT}px)`,
        }}
      >
        {label}
      </span>
    </div>
  );
}
