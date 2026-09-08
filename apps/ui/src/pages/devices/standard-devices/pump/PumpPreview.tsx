import { PumpSummary } from "./PumpSummary";
import type { StandardPreviewProps } from "../types";

/** The device card's preview slot — the same summary, sized for a denser
 *  card than the fleet grid's. */
export function PumpPreview({ device }: StandardPreviewProps) {
  return <PumpSummary device={device} size="sm" />;
}
