import { useTranslation } from "react-i18next";
import { isLiquidDetector, readLiquidDetectorAttributes } from "@/lib/devices";
import { cn } from "@/lib/utils";
import { ControlPanel } from "../ControlPanel";
import { LiquidDrop } from "./LiquidDrop";
import { LIQUID_VERDICT_TEXT_CLASS, liquidVerdict } from "./verdict";
import type { StandardControlProps } from "../types";

/** The detector exposes nothing writable, so the control is the card's two
 *  elements at a scale readable across a room. How long the state has held is
 *  deliberately absent: when the driver declares `liquid_detected` as a fault,
 *  the active-fault row right below already says "active since …", and two
 *  timestamps for one event disagree the moment they round differently. */
export function LiquidDetectorControl({ device }: StandardControlProps) {
  const { t } = useTranslation("standardDevices");

  if (!isLiquidDetector(device)) return null;

  const verdict = liquidVerdict(readLiquidDetectorAttributes(device));
  const tone = verdict
    ? LIQUID_VERDICT_TEXT_CLASS[verdict]
    : "text-muted-foreground";

  return (
    <ControlPanel
      className={cn(verdict === "detected" && "border-water/40 bg-water/5")}
    >
      <div className="flex items-center gap-5">
        <LiquidDrop verdict={verdict} className={cn("h-16 w-16", tone)} />
        <p
          className={cn(
            "min-w-0 truncate font-display text-4xl font-semibold leading-none",
            tone,
          )}
        >
          {verdict ? t(`liquid_detector.${verdict}`) : "—"}
        </p>
      </div>
    </ControlPanel>
  );
}
