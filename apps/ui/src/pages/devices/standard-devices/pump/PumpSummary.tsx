import { useTranslation } from "react-i18next";
import { isPump, readPumpAttributes } from "@/lib/devices";
import { cn } from "@/lib/utils";
import { PumpGlyph, pumpGlyphBounds } from "./PumpGlyph";
import { PUMP_STATE_TEXT_CLASS, pumpState } from "./state";
import type { StandardPreviewProps } from "../types";

const R = 42;
const BOUNDS = pumpGlyphBounds(0, 0, R);
const VIEW_BOX = `${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.w} ${BOUNDS.h}`;

/** The pump drawing plus its run state, for card-sized surfaces: the fleet
 *  card's lead slot and the device card's preview.
 *
 *  No reading. A pump's quantities — head, flow, speed, power — are different
 *  physical things with no shared unit, so picking one and printing it bare
 *  gives a figure that could mean any of four things.
 *
 *  The impeller never turns here. A grid of pumps all spinning at once is
 *  motion with nothing to say; the animation earns its place on the device
 *  page, where one pump is the subject. */
export function PumpSummary({
  device,
  size = "md",
}: StandardPreviewProps & { size?: "sm" | "md" }) {
  const { t } = useTranslation("standardDevices");
  if (!isPump(device)) return null;

  const state = pumpState(readPumpAttributes(device));
  const label = t(`pump.state.${state}`);

  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox={VIEW_BOX}
        role="img"
        aria-label={`${t("pump.name")} — ${label}`}
        className={cn("shrink-0", size === "sm" ? "h-11 w-7" : "h-16 w-10")}
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
          "truncate font-display font-semibold leading-none",
          size === "sm" ? "text-base" : "text-2xl",
          PUMP_STATE_TEXT_CLASS[state],
        )}
      >
        {label}
      </span>
    </div>
  );
}
