import type { Device } from "@gridone/sdk";

/**
 * What the fleet card says a device is doing, beside its numbers (the lead):
 *
 * - the **activity** tints the type tile — drawn plainly while the device is
 *   active, muted when it stands idle, dashed when it reports nothing to
 *   judge by;
 * - the **run status** fills the status line of an HVAC unit — the mode it
 *   runs in (in the mode's colour), or its run state in words. Types whose
 *   lead already words their state (a pump's "En marche") leave it out.
 *
 * Data only: `FleetTypeTile` and `FleetRunStatus` own the rendering, so every
 * type reads the same.
 */

export type FleetActivity = "active" | "idle" | "unknown";

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

/** A running unit is active; a stopped one idle. */
export const RUN_ACTIVITY: Record<RunState, FleetActivity> = {
  running: "active",
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
 *  `onoff_state` is false, unknown when neither is reported, else running (a
 *  unit reporting a mode but no on/off switch is taken as running). */
export function runState(
  onoffState: boolean | null,
  mode: string | null = null,
): RunState {
  if (onoffState === false) return "stopped";
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

/** The status of an HVAC unit: active while it runs, and its run status for
 *  the status line. */
export function hvacStatus(run: RunState, mode: string | null): FleetStatus {
  return { activity: RUN_ACTIVITY[run], runStatus: { run, mode } };
}

/** The status of a unit whose lead already words its run state. */
export function runOnlyStatus(run: RunState): FleetStatus {
  return { activity: RUN_ACTIVITY[run], runStatus: null };
}

/** The status of a sensor: active while it reports its reading. */
export function readingStatus(reporting: boolean): FleetStatus {
  return { activity: reporting ? "active" : "unknown", runStatus: null };
}
