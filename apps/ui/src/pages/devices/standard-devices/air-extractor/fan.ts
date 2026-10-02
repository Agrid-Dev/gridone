import type { RunState } from "../fleet-status";
import type { AirExtractorValues } from "./types";

type FanEvidence = Pick<
  AirExtractorValues,
  "onoffState" | "flowSwitch" | "fanSpeed"
>;

/** Whether the fan turns, by the best evidence the unit exposes. `null` when
 *  it reports nothing to tell from.
 *
 *  Proven airflow (`flow_switch`) is the source of truth — not the on/off
 *  command — so the two discordance faults render correctly:
 *
 *  | onoff_state | flow_switch | fan turning | meaning                        |
 *  |-------------|-------------|-------------|--------------------------------|
 *  | true        | true        | yes         | running, proven                |
 *  | true        | false       | no          | fan failed (commanded, no flow)|
 *  | false       | true        | yes         | reverse discordance            |
 *  | false       | false       | no          | stopped, normal                |
 *
 *  When no flow switch is exposed, fall back to the command; when neither
 *  is, to a reported speed (> 0). */
function fanTurning(values: FanEvidence): boolean | null {
  return (
    values.flowSwitch ??
    values.onoffState ??
    (values.fanSpeed != null ? values.fanSpeed > 0 : null)
  );
}

/** Whether the synoptic animates the fan: only on positive evidence. */
export function fanIsSpinning(values: FanEvidence): boolean {
  return fanTurning(values) === true;
}

/** Run state for the fleet card, from the same evidence as the synoptic's
 *  fan animation. Unknown when the unit reports none of it. */
export function extractorRunState(values: FanEvidence): RunState {
  const turning = fanTurning(values);
  if (turning == null) return "unknown";
  return turning ? "running" : "stopped";
}

export type FanStatusTone = "ok" | "warning" | "muted";

export type FanStatus = {
  key:
    | "on"
    | "off"
    | "commandedNoFlow"
    | "flowWithoutCommand"
    | "flowProven"
    | "flowMissing";
  tone: FanStatusTone;
};

/** Status-dot fill per tone (literal classes so Tailwind keeps them). */
export const FAN_STATUS_DOT_CLASS: Record<FanStatusTone, string> = {
  ok: "bg-status-ok",
  warning: "bg-status-warning",
  muted: "bg-muted-foreground",
};

/** Single derived status combining the on/off command and the flow switch.
 *
 *  Showing the two points side by side reads as a contradiction on the
 *  discordance rows of the {@link fanIsSpinning} table ("stopped" next to a
 *  spinning fan), so they collapse into one status that always agrees with
 *  the fan animation: the concordant rows read plainly as on/off, the
 *  discordant rows get an explicit warning label. When only one point is
 *  exposed, that point speaks for itself. */
export function fanStatus(
  values: Pick<AirExtractorValues, "onoffState" | "flowSwitch">,
): FanStatus | null {
  const commanded = values.onoffState;
  const flow = values.flowSwitch;
  if (commanded == null && flow == null) return null;
  if (commanded == null) {
    return flow
      ? { key: "flowProven", tone: "ok" }
      : { key: "flowMissing", tone: "muted" };
  }
  if (flow == null) {
    return commanded
      ? { key: "on", tone: "ok" }
      : { key: "off", tone: "muted" };
  }
  if (commanded && flow) return { key: "on", tone: "ok" };
  if (commanded) return { key: "commandedNoFlow", tone: "warning" };
  if (flow) return { key: "flowWithoutCommand", tone: "warning" };
  return { key: "off", tone: "muted" };
}
