import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import type { LevelSummary } from "./levelSummaries";
import type { RoomState } from "./roomStates";
import { GROUP_LIMIT, isEmptyResult, searchViewer } from "./viewerSearch";

function zone(
  globalId: string,
  name: string,
  objectType: string | null = null,
) {
  return {
    globalId,
    name,
    temperature: null,
    severity: null,
    objectType,
    connection: null,
  };
}

const levels: LevelSummary[] = [
  {
    globalId: "st-1",
    name: "R+1",
    short: "R+1",
    index: 1,
    zoneCount: 2,
    alertCount: 0,
    zones: [
      zone("s1", "Chambre 101", "Chambre Twin"),
      zone("s2", "Local technique"),
    ],
  },
  {
    globalId: "st-0",
    name: "RDC",
    short: "RDC",
    index: 0,
    zoneCount: 1,
    alertCount: 0,
    zones: [zone("s3", "Réception")],
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
  ["s2", roomState("s2", "a2", "Local technique")],
  ["s3", roomState("s3", null, "Réception")],
]);

function device(
  id: string,
  name: string,
  assetId?: string,
  type?: string,
): Device {
  return {
    id,
    name,
    type,
    tags: assetId ? { asset_id: assetId } : {},
  } as unknown as Device;
}

const devices: Device[] = [
  device("d1", "Thermostat 101", "a1", "thermostat"),
  device("d2", "Compteur RDC", "a9", "electricity_meter"),
  device("d3", "Sonde technique", "a2", "thermostat"),
];

function run(
  query: string,
  overrides: Partial<Parameters<typeof searchViewer>[0]> = {},
) {
  return searchViewer({ levels, roomStates, devices, query, ...overrides });
}

describe("searchViewer", () => {
  it("returns null for an empty or blank query", () => {
    expect(run("")).toBeNull();
    expect(run("   ")).toBeNull();
  });

  it("matches zones by name and by IFC object type", () => {
    expect(run("101")?.zones.map((hit) => hit.zone.globalId)).toEqual(["s1"]);
    expect(run("twin")?.zones.map((hit) => hit.zone.globalId)).toEqual(["s1"]);
  });

  it("carries the level name of each zone hit", () => {
    expect(run("réception")?.zones).toEqual([
      { zone: levels[1].zones[0], levelName: "RDC" },
    ]);
  });

  it("resolves a device to the room it is linked to", () => {
    const hit = run("thermostat 101")?.devices[0];
    expect(hit).toMatchObject({
      globalId: "s1",
      roomName: "Chambre 101",
      levelName: "R+1",
    });
  });

  it("matches devices on id and raw type as well as name", () => {
    expect(run("d3")?.devices.map((hit) => hit.device.id)).toEqual(["d3"]);
    // Both thermostats, ordered by name.
    expect(run("thermostat")?.devices.map((hit) => hit.device.id)).toEqual([
      "d3",
      "d1",
    ]);
  });

  it("does not match a device on its room's name", () => {
    // "Chambre 101" is the room, not the device: the device group stays empty
    // while the zone group answers.
    const results = run("chambre");
    expect(results?.zones).toHaveLength(1);
    expect(results?.devices).toHaveLength(0);
  });

  it("sets aside devices the model cannot place", () => {
    // a9 is not a space of the model.
    expect(run("compteur")?.offModel.map((d) => d.id)).toEqual(["d2"]);
    expect(run("compteur")?.devices).toHaveLength(0);
  });

  it("treats a device with no asset link as off-model", () => {
    const orphan = device("d4", "Sonde libre");
    expect(run("sonde libre", { devices: [orphan] })?.offModel).toEqual([
      orphan,
    ]);
  });

  it("treats a room absent from the levels as unreachable", () => {
    // The room exists in the states but no level lists it: flying there would
    // isolate a storey that is not in the rail.
    const orphanRooms = new Map(roomStates);
    orphanRooms.set("s9", roomState("s9", "a9", "Chambre fantôme"));
    const results = run("compteur", { roomStates: orphanRooms });
    expect(results?.devices).toHaveLength(0);
    expect(results?.offModel.map((d) => d.id)).toEqual(["d2"]);
  });

  it("caps each group and reports the overflow", () => {
    const many = Array.from({ length: GROUP_LIMIT + 3 }, (_, index) =>
      device(`x${index}`, `Vanne ${String(index).padStart(3, "0")}`, "a1"),
    );
    const results = run("vanne", { devices: many });
    expect(results?.devices).toHaveLength(GROUP_LIMIT);
    expect(results?.overflow).toBe(3);
  });

  it("distinguishes an empty result from not searching at all", () => {
    expect(isEmptyResult(run("zzz"))).toBe(true);
    expect(isEmptyResult(run("101"))).toBe(false);
    expect(isEmptyResult(null)).toBe(false);
  });
});
