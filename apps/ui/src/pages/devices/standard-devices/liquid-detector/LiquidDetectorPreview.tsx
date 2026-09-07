import { useTranslation } from "react-i18next";
import { isLiquidDetector, readLiquidDetectorAttributes } from "@/lib/devices";
import { cn } from "@/lib/utils";
import { LiquidDrop } from "./LiquidDrop";
import { LIQUID_VERDICT_TEXT_CLASS, liquidVerdict } from "./verdict";
import type { StandardPreviewProps } from "../types";

/** One line inside the device card: the drop, and the word. Everything above
 *  it — connection status, fault badge, type chip, name — is the card's. */
export function LiquidDetectorPreview({ device }: StandardPreviewProps) {
  const { t } = useTranslation("standardDevices");
  if (!isLiquidDetector(device)) return null;

  const verdict = liquidVerdict(readLiquidDetectorAttributes(device));
  const tone = verdict
    ? LIQUID_VERDICT_TEXT_CLASS[verdict]
    : "text-muted-foreground";

  return (
    <div className="flex min-w-0 items-center gap-2">
      <LiquidDrop verdict={verdict} className={cn("h-5 w-5", tone)} />
      <span className={cn("truncate text-2xl font-light leading-none", tone)}>
        {verdict ? t(`liquid_detector.${verdict}`) : "—"}
      </span>
    </div>
  );
}
