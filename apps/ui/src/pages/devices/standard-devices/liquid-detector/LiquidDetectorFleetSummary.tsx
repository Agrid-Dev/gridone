import { useTranslation } from "react-i18next";
import {
  readLiquidDetectorAttributes,
  type LiquidDetectorDevice,
} from "@/lib/devices";
import { cn } from "@/lib/utils";
import { LiquidDrop } from "./LiquidDrop";
import { LIQUID_VERDICT_TEXT_CLASS, liquidVerdict } from "./verdict";

/** The fleet card's lead slot for a detector: a verdict, not a number. Used
 *  instead of the numeric measure + sparkline, which a boolean has neither
 *  of. */
export function LiquidDetectorFleetSummary({
  device,
}: {
  device: LiquidDetectorDevice;
}) {
  const { t } = useTranslation("standardDevices");
  const verdict = liquidVerdict(readLiquidDetectorAttributes(device));
  const tone = verdict
    ? LIQUID_VERDICT_TEXT_CLASS[verdict]
    : "text-muted-foreground";

  return (
    <div className="flex items-center gap-3 py-0.5">
      <LiquidDrop verdict={verdict} className={cn("h-8 w-8", tone)} />
      <span
        className={cn(
          "truncate font-display text-2xl font-semibold leading-none",
          tone,
        )}
      >
        {verdict ? t(`liquid_detector.${verdict}`) : "—"}
      </span>
    </div>
  );
}
