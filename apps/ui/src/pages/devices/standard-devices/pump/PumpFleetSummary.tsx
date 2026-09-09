import { PumpSummary } from "./PumpSummary";
import type { StandardPreviewProps } from "../types";

/** The fleet card's lead slot for a pump. */
export function PumpFleetSummary({ device }: StandardPreviewProps) {
  return <PumpSummary device={device} />;
}
