import { useTranslation } from "react-i18next";
import { isPump, readPumpAttributes } from "@/lib/devices";
import { PumpGlyph } from "./PumpGlyph";
import { pumpState } from "./state";
import type { StandardPreviewProps } from "../types";

/** The fleet card's lead slot for a pump: the pump itself, saying whether it
 *  turns. No number — the quantities a pump reports (head, flow, power) are
 *  different physical things with no shared unit, so a bare figure in a fleet
 *  card would be one number meaning four possible things. The drawing answers
 *  the question a fleet view actually asks. */
export function PumpFleetSummary({ device }: StandardPreviewProps) {
  const { t } = useTranslation("standardDevices");
  if (!isPump(device)) return null;

  const state = pumpState(readPumpAttributes(device));

  return (
    <div className="flex items-center py-0.5">
      <svg
        viewBox="0 0 130 130"
        role="img"
        aria-label={`${t("pump.name")} — ${t(`pump.state.${state}`)}`}
        className="h-12 w-12"
      >
        <PumpGlyph
          cx={65}
          cy={80}
          r={42}
          state={state}
          spinning={state === "running"}
          title={t(`pump.state.${state}`)}
        />
      </svg>
    </div>
  );
}
