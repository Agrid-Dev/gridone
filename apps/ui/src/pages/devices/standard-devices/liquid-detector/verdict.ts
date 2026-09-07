import type { LiquidDetectorValues } from "./types";

/** The two states a detector reports. */
export type LiquidVerdict = "detected" | "dry";

/** Null when the detector has not reported yet — callers render a placeholder
 *  rather than claiming the probe is dry. */
export function liquidVerdict(
  values: LiquidDetectorValues,
): LiquidVerdict | null {
  if (values.liquidDetected == null) return null;
  return values.liquidDetected ? "detected" : "dry";
}

/** Liquid takes the hydraulic blue, never the alarm red. Whether a wet probe
 *  is an alarm is the fault layer's answer, not this component's: drivers
 *  declare `liquid_detected` as an alert-severity fault, so the severity tint,
 *  fault badge and active-fault row already say so around this reading. Using
 *  red here too would spend two channels on one fact and leave none for the
 *  reading itself. Literal classes so Tailwind keeps them. */
export const LIQUID_VERDICT_TEXT_CLASS: Record<LiquidVerdict, string> = {
  detected: "text-water",
  dry: "text-muted-foreground",
};
