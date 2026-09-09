import type { PumpValues } from "./types";

/** What the pump is doing. Only run state — faults are not this component's
 *  business. The schema does not carry them, and the platform already says so
 *  in its own vocabulary: fault badge, severity tint, active-fault row. */
export type PumpState = "running" | "stopped" | "unknown";

export function pumpState(values: PumpValues): PumpState {
  if (values.onoffState == null) return "unknown";
  return values.onoffState ? "running" : "stopped";
}

/** Tone for the impeller, casing ring and flow.
 *
 *  Deliberately *not* the status palette. Green, amber and red mean healthy,
 *  warning and alarm everywhere else in the app, and a pump drawn in them
 *  competes with the connection dot and the fault badge sitting beside it for
 *  the same reading. The pump uses the hydraulic accent instead: it is moving
 *  liquid or it is not.
 *
 *  Literal classes so Tailwind keeps them; both tokens are theme-aware. */
export const PUMP_STATE_TEXT_CLASS: Record<PumpState, string> = {
  running: "text-water",
  stopped: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

export const PUMP_STATE_STROKE_CLASS: Record<PumpState, string> = {
  running: "stroke-water",
  stopped: "stroke-border",
  unknown: "stroke-border",
};
