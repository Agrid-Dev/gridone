import { describe, expect, it } from "vitest";
import type { Device, FaultView } from "@gridone/sdk";
import type { Severity } from "@/lib/severity";
import type { LevelSummary } from "./levelSummaries";
import type { RoomState } from "./roomStates";
import { buildViewerAlerts, hasNothingToShow } from "./viewerAlerts";

function zone(globalId: string, name: string) {
  return {
    globalId,
    name,
    temperature: null,
    severity: null,
    objectType: null,
    connection: null,
  };
}

const levels: LevelSummary[] = [
  {
    globalId: "st-2",
    name: "R+2",
    short: "R+2",
    index: 2,
    zoneCount: 1,
    alertCount: 1,
    zones: [zone("s2", "Chambre 201")],
  },
  {
    globalId: "st-1",
    name: "R+1",
    short: "R+1",
    index: 1,
    zoneCount: 2,
    alertCount: 1,
    zones: [zone("s1", "Chambre 101"), zone("s1b", "Chambre 102")],
  },
];

function roomState(
  globalId: string,
  assetId: string | null,
  name: string,
): RoomState {
  return {
    globalId,
    assetId,
    name,
    temperature: null,
    severity: null,
    objectType: null,
    connection: null,
    devices: [],
  };
}

const roomStates = new Map<string, RoomState>([
  ["s1", roomState("s1", "a1", "Chambre 101")],
  ["s1b", roomState("s1b", "a1b", "Chambre 102")],
  ["s2", roomState("s2", "a2", "Chambre 201")],
]);

function device(id: string, assetId?: string): Device {
  return {
    id,
    name: id,
    tags: assetId ? { asset_id: assetId } : {},
  } as unknown as Device;
}

const devices: Device[] = [
  device("d1", "a1"),
  device("d2", "a1"),
  device("d3", "a2"),
  device("d4", "a1b"),
  device("d9"),
];

function fault(
  deviceId: string,
  deviceName: string,
  attribute: string,
  severity: Severity,
): FaultView {
  return {
    device_id: deviceId,
    device_name: deviceName,
    attribute_name: attribute,
    data_type: "bool",
    severity,
    current_value: true,
    last_updated: "2026-09-03T10:00:00Z",
    last_changed: "2026-09-03T10:00:00Z",
  } as unknown as FaultView;
}

function run(faults: FaultView[], overrides = {}) {
  return buildViewerAlerts({
    faults,
    devices,
    roomStates,
    levels,
    ...overrides,
  });
}

describe("buildViewerAlerts", () => {
  it("returns nothing for an empty fault list", () => {
    expect(run([])).toEqual({
      alerts: [],
      warnings: [],
      alertCount: 0,
      warningCount: 0,
      offModelCount: 0,
    });
    expect(hasNothingToShow(run([]))).toBe(true);
  });

  it("collapses a device's several faults into one row, named by the worst", () => {
    // Declared out of alphabetical order on purpose: the label must not depend
    // on the order the API returned the faults in.
    const alerts = run([
      fault("d1", "Thermostat 101", "comm_error", "alert"),
      fault("d1", "Thermostat 101", "battery_low", "alert"),
      fault("d1", "Thermostat 101", "filter_dirty", "warning"),
    ]);
    expect(alerts.alerts).toHaveLength(1);
    expect(alerts.alerts[0].devices).toEqual([
      {
        deviceId: "d1",
        deviceName: "Thermostat 101",
        severity: "alert",
        faultCount: 3,
        label: "Battery Low",
      },
    ]);
  });

  it("groups devices of the same room together", () => {
    const alerts = run([
      fault("d2", "Vanne 101", "stuck", "alert"),
      fault("d1", "Thermostat 101", "comm_error", "alert"),
    ]);
    expect(alerts.alerts).toHaveLength(1);
    expect(alerts.alerts[0].devices.map((row) => row.deviceId)).toEqual([
      "d1",
      "d2",
    ]);
  });

  it("counts rooms, not faults, so the chip matches the level badges", () => {
    const alerts = run([
      fault("d1", "Thermostat 101", "comm_error", "alert"),
      fault("d2", "Vanne 101", "stuck", "alert"),
      fault("d3", "Thermostat 201", "comm_error", "alert"),
    ]);
    expect(alerts.alertCount).toBe(2);
    expect(levels[0].alertCount + levels[1].alertCount).toBe(2);
  });

  it("orders rooms by floor, highest first, then by name", () => {
    const alerts = run([
      fault("d1", "Thermostat 101", "comm_error", "alert"),
      fault("d4", "Thermostat 102", "comm_error", "alert"),
      fault("d3", "Thermostat 201", "comm_error", "alert"),
    ]);
    expect(alerts.alerts.map((group) => group.roomName)).toEqual([
      "Chambre 201",
      "Chambre 101",
      "Chambre 102",
    ]);
  });

  it("sorts a room's devices worst first", () => {
    const alerts = run([
      fault("d2", "Vanne 101", "filter_dirty", "warning"),
      fault("d1", "Thermostat 101", "comm_error", "alert"),
    ]);
    expect(alerts.alerts[0].devices.map((row) => row.severity)).toEqual([
      "alert",
      "warning",
    ]);
  });

  it("separates rooms whose worst fault is only a warning", () => {
    const alerts = run([
      fault("d1", "Thermostat 101", "filter_dirty", "warning"),
      fault("d3", "Thermostat 201", "comm_error", "alert"),
    ]);
    expect(alerts.alerts.map((group) => group.roomName)).toEqual([
      "Chambre 201",
    ]);
    expect(alerts.warnings.map((group) => group.roomName)).toEqual([
      "Chambre 101",
    ]);
    expect(alerts.alertCount).toBe(1);
    expect(alerts.warningCount).toBe(1);
  });

  it("ignores info-severity faults", () => {
    const alerts = run([fault("d1", "Thermostat 101", "hello", "info")]);
    expect(hasNothingToShow(alerts)).toBe(true);
  });

  it("counts faulty devices the model cannot place, without listing them", () => {
    const alerts = run([
      fault("d9", "Compteur général", "comm_error", "alert"),
      fault("d9", "Compteur général", "battery_low", "alert"),
    ]);
    expect(alerts.alerts).toHaveLength(0);
    expect(alerts.offModelCount).toBe(1);
    expect(hasNothingToShow(alerts)).toBe(false);
  });

  it("counts a fault on an unknown device as off-model", () => {
    expect(
      run([fault("ghost", "Inconnu", "comm_error", "alert")]).offModelCount,
    ).toBe(1);
  });

  it("treats a room absent from the levels as unplaceable", () => {
    const orphan = new Map(roomStates);
    orphan.set("s9", roomState("s9", "a1", "Chambre fantôme"));
    orphan.delete("s1");
    const alerts = run([fault("d1", "Thermostat 101", "comm_error", "alert")], {
      roomStates: orphan,
    });
    expect(alerts.alerts).toHaveLength(0);
    expect(alerts.offModelCount).toBe(1);
  });
});
