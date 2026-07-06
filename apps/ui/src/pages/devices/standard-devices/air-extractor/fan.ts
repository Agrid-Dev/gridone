import type { AirExtractorValues } from "./types";

/** Whether the extractor fan is physically turning.
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
 *  When no flow switch is exposed, fall back to the command. */
export function fanIsSpinning(
  values: Pick<AirExtractorValues, "onoffState" | "flowSwitch">,
): boolean {
  return values.flowSwitch ?? values.onoffState === true;
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
