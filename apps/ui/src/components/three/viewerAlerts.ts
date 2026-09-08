/**
 * Active faults of the building, grouped the way the viewer can act on them:
 * by room, so a click can fly there.
 *
 * `FaultView` is one row per device *and attribute*, so a device with three
 * bad attributes would otherwise triple the list; rows are collapsed to one
 * per device, carrying how many faults it holds. Faults whose device the model
 * cannot place are counted apart — dropping them silently would make the count
 * contradict the faults page.
 */
import type { Device, FaultView } from "@gridone/sdk";
import { faultLabel } from "@/lib/faultLabel";
import type { Severity } from "@/lib/severity";
import { indexRoomsByAsset, type LevelSummary } from "./levelSummaries";
import type { RoomState } from "./roomStates";

/** Severities the viewer surfaces, worst first. `info` is not a fault to act on. */
const SHOWN: readonly Severity[] = ["alert", "warning"];

export type AlertDeviceRow = {
  deviceId: string;
  deviceName: string;
  /** Worst active severity of that device. */
  severity: Severity;
  /** How many of its faults are shown here. */
  faultCount: number;
  /** Human label of its worst fault. */
  label: string;
};

export type AlertRoomGroup = {
  /** Space to fly to. */
  globalId: string;
  roomName: string;
  levelName: string;
  levelIndex: number;
  /** Worst severity in the room, which decides the section it lands in. */
  severity: Severity;
  devices: AlertDeviceRow[];
};

export type ViewerAlerts = {
  /** Rooms holding at least one alert, worst floor first. */
  alerts: AlertRoomGroup[];
  /** Rooms whose worst fault is a warning. */
  warnings: AlertRoomGroup[];
  /** Rooms in alert — the chip's number, and the sum of the level badges. */
  alertCount: number;
  /** Rooms whose worst is a warning. */
  warningCount: number;
  /** Faulty devices the model cannot place. */
  offModelCount: number;
};

const RANK: Record<Severity, number> = { alert: 2, warning: 1, info: 0 };

/** Worst first, then by name — a stable order the popover can freeze. */
function bySeverityThenName(
  a: { severity: Severity; name: string },
  b: { severity: Severity; name: string },
): number {
  return RANK[b.severity] - RANK[a.severity] || a.name.localeCompare(b.name);
}

function isShown(severity: Severity): boolean {
  return SHOWN.includes(severity);
}

export function buildViewerAlerts({
  faults,
  devices,
  roomStates,
  levels,
}: {
  faults: FaultView[];
  devices: Device[];
  roomStates: Map<string, RoomState>;
  levels: LevelSummary[];
}): ViewerAlerts {
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const rooms = indexRoomsByAsset(roomStates, levels);

  // device id -> its shown faults, so each device becomes one row.
  const faultsByDevice = new Map<string, FaultView[]>();
  for (const fault of faults) {
    if (!isShown(fault.severity)) {
      continue;
    }
    const bucket = faultsByDevice.get(fault.device_id);
    if (bucket) {
      bucket.push(fault);
    } else {
      faultsByDevice.set(fault.device_id, [fault]);
    }
  }

  const groups = new Map<string, AlertRoomGroup>();
  let offModelCount = 0;
  for (const [deviceId, deviceFaults] of faultsByDevice) {
    const assetId = deviceById.get(deviceId)?.tags?.asset_id;
    const room = assetId ? rooms.get(assetId) : undefined;
    if (!room) {
      offModelCount += 1;
      continue;
    }
    // The worst fault names the row. Ties break on the attribute name rather
    // than on list order, so a refetch cannot relabel a row that has not moved.
    const worst = [...deviceFaults].sort(
      (a, b) =>
        RANK[b.severity] - RANK[a.severity] ||
        a.attribute_name.localeCompare(b.attribute_name),
    )[0];
    const severity = worst.severity;
    const row: AlertDeviceRow = {
      deviceId,
      deviceName: worst.device_name || deviceId,
      severity,
      faultCount: deviceFaults.length,
      label: faultLabel({
        name: worst.attribute_name,
        data_type: worst.data_type,
        current_value: worst.current_value,
      }),
    };
    const group = groups.get(room.globalId);
    if (group) {
      group.devices.push(row);
      if (RANK[severity] > RANK[group.severity]) {
        group.severity = severity;
      }
    } else {
      groups.set(room.globalId, { ...room, severity, devices: [row] });
    }
  }

  for (const group of groups.values()) {
    group.devices.sort((a, b) =>
      bySeverityThenName(
        { severity: a.severity, name: a.deviceName },
        { severity: b.severity, name: b.deviceName },
      ),
    );
  }

  // Highest floor first, mirroring the levels rail, then by room name — a
  // deterministic order, so a refetch cannot reshuffle rows under the cursor.
  const ordered = [...groups.values()].sort(
    (a, b) =>
      b.levelIndex - a.levelIndex || a.roomName.localeCompare(b.roomName),
  );
  const alerts = ordered.filter((group) => group.severity === "alert");
  const warnings = ordered.filter((group) => group.severity === "warning");

  return {
    alerts,
    warnings,
    alertCount: alerts.length,
    warningCount: warnings.length,
    offModelCount,
  };
}

/** Nothing worth a chip: no room in alert, none in warning, nothing off-model. */
export function hasNothingToShow(alerts: ViewerAlerts): boolean {
  return (
    alerts.alertCount === 0 &&
    alerts.warningCount === 0 &&
    alerts.offModelCount === 0
  );
}
