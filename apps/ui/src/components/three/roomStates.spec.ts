import { describe, expect, it } from "vitest";
import type { Asset, Device, ModelSpace } from "@gridone/sdk";
import { buildRoomStates } from "./roomStates";

function makeSpace(globalId: string, name: string): ModelSpace {
  return {
    global_id: globalId,
    name,
    storey_global_id: "st",
    storey_name: "L0",
  };
}

function makeAsset(id: string, ifcGlobalId: string | null): Asset {
  return {
    id,
    parent_id: "floor-1",
    type: "room",
    name: `Room ${id}`,
    path: ["root", "b1", "floor-1", id],
    position: 0,
    ifc_global_id: ifcGlobalId,
  } as Asset;
}

function makeThermostat(
  id: string,
  assetId: string,
  temperature: number | null,
  faultSeverity?: "info" | "warning" | "alert",
): Device {
  const attributes: Record<string, unknown> = {
    temperature: {
      kind: "measure",
      name: "temperature",
      data_type: "float",
      read_write_modes: ["read"],
      current_value: temperature,
      last_updated: null,
      last_changed: null,
    },
  };
  if (faultSeverity) {
    attributes.overheat = {
      kind: "fault",
      name: "overheat",
      data_type: "bool",
      read_write_modes: ["read"],
      current_value: true,
      is_faulty: true,
      severity: faultSeverity,
      last_updated: null,
      last_changed: null,
    };
  }
  return {
    id,
    name: id,
    type: "thermostat",
    tags: { asset_id: assetId },
    attributes,
    config: {},
    driver_id: "d",
    transport_id: "t",
    is_faulty: !!faultSeverity,
  } as unknown as Device;
}

describe("buildRoomStates", () => {
  it("joins spaces to assets and reads the thermostat temperature", () => {
    const states = buildRoomStates(
      [makeSpace("sp-1", "Room 101"), makeSpace("sp-2", "Room 102")],
      [makeAsset("a1", "sp-1"), makeAsset("a2", null)],
      [makeThermostat("t1", "a1", 21.4)],
    );

    const linked = states.get("sp-1");
    expect(linked).toMatchObject({
      assetId: "a1",
      name: "Room a1",
      temperature: 21.4,
      severity: null,
    });
    // Unlinked space falls back to the model's space name, no data.
    expect(states.get("sp-2")).toMatchObject({
      assetId: null,
      name: "Room 102",
      temperature: null,
      severity: null,
      devices: [],
    });
  });

  it("keeps the worst active fault severity of the room's devices", () => {
    const states = buildRoomStates(
      [makeSpace("sp-1", "Room 101")],
      [makeAsset("a1", "sp-1")],
      [
        makeThermostat("t1", "a1", 22, "warning"),
        makeThermostat("t2", "a1", 23, "alert"),
      ],
    );

    expect(states.get("sp-1")?.severity).toBe("alert");
    expect(states.get("sp-1")?.devices).toHaveLength(2);
  });

  it("ignores devices linked to other assets", () => {
    const states = buildRoomStates(
      [makeSpace("sp-1", "Room 101")],
      [makeAsset("a1", "sp-1")],
      [makeThermostat("t1", "other-asset", 25)],
    );

    expect(states.get("sp-1")?.temperature).toBeNull();
  });

  it("reads temperature only from thermostat-type devices", () => {
    const meter = {
      ...makeThermostat("m1", "a1", 999),
      type: "electricity_meter",
      attributes: {},
    } as unknown as Device;
    const states = buildRoomStates(
      [makeSpace("sp-1", "Room 101")],
      [makeAsset("a1", "sp-1")],
      [meter],
    );

    expect(states.get("sp-1")?.temperature).toBeNull();
  });
});
