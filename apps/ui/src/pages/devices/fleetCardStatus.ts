import type { Device } from "@gridone/sdk";
import { ConnectionStatus, getConnectionStatus } from "@/lib/devices";
import { activeFaultSummary } from "@/lib/faults";
import { mostSevere, type Severity } from "@/lib/severity";
import type {
  FleetActivity,
  FleetRunStatus,
} from "./standard-devices/fleet-status";
import { getFleetStatus } from "./standard-devices/registry";

/** The colour of a fleet card's outline: its most severe active fault, else
 *  green while the unit runs. */
export type FleetOutline = Severity | "running";

/** Everything a fleet card says about a device's state, and so what its type
 *  group counts (see {@link fleetGroupCounts}). */
export type FleetCardStatus = {
  /** The type tile's tone — unknown while the device is disconnected. */
  activity: FleetActivity;
  /** The status line; none while disconnected. */
  runStatus: FleetRunStatus | null;
  /** The connection, written on the card only when it goes wrong (degraded
   *  or disconnected) and the viewer may see it. */
  connection: ConnectionStatus | null;
  /** Disconnected: the values on the card are the last ones received. */
  stale: boolean;
  faults: { severity: Severity; count: number } | null;
  /** Null keeps the card's neutral hairline. */
  outline: FleetOutline | null;
};

/** Connection statuses worth a word on a card: the others (connected, or
 *  nothing tracked yet) are the normal case, and the fleet summary counts
 *  them. */
const WORDED_CONNECTIONS: ReadonlySet<ConnectionStatus> = new Set([
  ConnectionStatus.Degraded,
  ConnectionStatus.Error,
]);

/**
 * What the fleet card shows of `device`: the type's fleet status (see
 * fleet-status), overruled while the device is disconnected — its last
 * values say nothing about now, so it is neither running nor stopped and
 * has no status line — then the outline, which the most severe fault wins
 * over the green of a running unit.
 *
 * Connection status is admin diagnostics: `canSeeConnectionStatus` false
 * leaves every device read as connected, as the rest of the page does.
 */
export function fleetCardStatus(
  device: Device,
  canSeeConnectionStatus: boolean,
): FleetCardStatus {
  const { activity, runStatus } = getFleetStatus(device.type)(device);
  const status = canSeeConnectionStatus ? getConnectionStatus(device) : null;
  const connection = status && WORDED_CONNECTIONS.has(status) ? status : null;
  const stale = connection === ConnectionStatus.Error;
  const faults = activeFaultSummary(device);
  const shown: FleetActivity = stale ? "unknown" : activity;
  return {
    activity: shown,
    runStatus: stale ? null : runStatus,
    connection,
    stale,
    faults,
    outline: faults?.severity ?? (shown === "running" ? "running" : null),
  };
}

/** A type group's states, for the line beside its heading. */
export type FleetGroupCounts = {
  running: number;
  stopped: number;
  disconnected: number;
  faulty: number;
  /** The most severe fault in the group — the colour of its fault count. */
  severity: Severity | null;
};

/** How many of a group's cards run, stand stopped, are disconnected or carry
 *  a fault — counted from the very statuses the cards show. */
export function fleetGroupCounts(
  statuses: readonly FleetCardStatus[],
): FleetGroupCounts {
  const faulty = statuses.flatMap(({ faults }) =>
    faults ? [faults.severity] : [],
  );
  return {
    running: statuses.filter(({ activity }) => activity === "running").length,
    stopped: statuses.filter(({ activity }) => activity === "idle").length,
    disconnected: statuses.filter(({ stale }) => stale).length,
    faulty: faulty.length,
    severity: mostSevere(faulty),
  };
}
