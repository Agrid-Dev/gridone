import type { Device } from "@gridone/sdk";

/**
 * What the fleet card says a device is doing, beside its numbers (the lead):
 *
 * - the **activity** tints the type tile — drawn plainly while a unit runs
 *   or a sensor reports, muted when a unit stands idle, dashed when there is
 *   nothing to judge by — and outlines the card in green while a unit runs;
 * - the **run status** fills the status line of an HVAC unit — the mode it
 *   runs in (in the mode's colour), or its run state in words. Types whose
 *   lead already words their state (a pump's "En marche") leave it out.
 *
 * Data only: `FleetTypeTile`, `FleetRunStatusLine` and the card own the
 * rendering, so every type reads the same.
 */

/** `running`: a unit that runs (green outline); `reporting`: a sensor with a
 *  reading — nothing to run, so no outline; `idle`: a unit that stands
 *  stopped; `unknown`: nothing to judge by. */
export type FleetActivity = "running" | "reporting" | "idle" | "unknown";

export type RunState = "running" | "stopped" | "unknown";

/** A unit's run state, and the HVAC mode it runs in (null when it reports
 *  none, or none applies — an air handler with both batteries shut). */
export type FleetRunStatus = {
  run: RunState;
  mode: string | null;
};

export type FleetStatus = {
  activity: FleetActivity;
  runStatus: FleetRunStatus | null;
};

/** A type's fleet status from its device state. */
export type FleetStatusOf = (device: Device) => FleetStatus;

/** A unit's activity from its run state. */
export const RUN_ACTIVITY: Record<RunState, FleetActivity> = {
  running: "running",
  stopped: "idle",
  unknown: "unknown",
};

/** Nothing to judge by: a device of no registered type, or one whose state
 *  does not match its type. */
export const UNKNOWN_STATUS: FleetStatus = {
  activity: "unknown",
  runStatus: null,
};

/** The fleet status of a device of no registered type. */
export const unknownFleetStatus: FleetStatusOf = () => UNKNOWN_STATUS;

/** Run state from the standard on/off and mode attributes: stopped when
 *  `onoff_state` is false or the mode is `off` (an air handler may report
 *  only its `hvac_mode`), unknown when neither is reported, else running (a
 *  unit reporting a mode but no on/off switch is taken as running). */
export function runState(
  onoffState: boolean | null,
  mode: string | null = null,
): RunState {
  if (onoffState === false || mode === "off") return "stopped";
  if (onoffState == null && mode == null) return "unknown";
  return "running";
}

/** What an air handler's coil is doing, from its battery valves: heating or
 *  cooling while that valve is open (> 0 %), idle (null) when both are
 *  reported shut — ventilation only. A unit reporting no valve falls back
 *  to its `hvac_mode`. */
export function coilMode(
  heatingValve: number | null,
  coolingValve: number | null,
  hvacMode: string | null,
): string | null {
  if (heatingValve != null && heatingValve > 0) return "heat";
  if (coolingValve != null && coolingValve > 0) return "cool";
  if (heatingValve != null || coolingValve != null) return null;
  return hvacMode;
}

/** The status of an HVAC unit: running or idle by its run state, and its run
 *  status for the status line. */
export function hvacStatus(run: RunState, mode: string | null): FleetStatus {
  return { activity: RUN_ACTIVITY[run], runStatus: { run, mode } };
}

/** The status of a unit whose lead already words its run state. */
export function runOnlyStatus(run: RunState): FleetStatus {
  return { activity: RUN_ACTIVITY[run], runStatus: null };
}

/** The status of a sensor: reporting while it has its reading — never
 *  running, since it has nothing to run. */
export function readingStatus(reporting: boolean): FleetStatus {
  return { activity: reporting ? "reporting" : "unknown", runStatus: null };
}
