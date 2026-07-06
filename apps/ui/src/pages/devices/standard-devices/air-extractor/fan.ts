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
 *  The discordance rows are surfaced as faults by the device itself; here we
 *  only animate the fan. When no flow switch is exposed, fall back to the
 *  command. */
export function fanIsSpinning(
  values: Pick<AirExtractorValues, "onoffState" | "flowSwitch">,
): boolean {
  return values.flowSwitch ?? values.onoffState === true;
}
