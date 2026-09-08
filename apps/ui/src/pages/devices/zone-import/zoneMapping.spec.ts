import { describe, expect, it } from "vitest";
import type { Asset, Device } from "@gridone/sdk";
import { parseZoneMapping, toAssignments } from "./zoneMapping";

function device(id: string, name: string, assetId?: string): Device {
  return {
    id,
    name,
    tags: assetId ? { asset_id: assetId } : {},
    attributes: {},
    config: {},
    driver_id: "drv",
    transport_id: "trp",
    is_faulty: false,
  } as Device;
}

const LOBBY: Asset = {
  id: "zone-lobby",
  parent_id: null,
  type: "room",
  name: "Lobby",
  path: ["zone-lobby"],
};
const ATTIC: Asset = {
  ...LOBBY,
  id: "zone-attic",
  name: "Attic",
  path: ["zone-attic"],
};

const CONTEXT = {
  devices: [
    device("dev-free", "Free sensor"),
    device("dev-lobby", "Lobby sensor", "zone-lobby"),
  ],
  assetsById: { [LOBBY.id]: LOBBY, [ATTIC.id]: ATTIC },
};

const HEADER = "device_id,asset_id";

function parse(body: string) {
  return parseZoneMapping(`${HEADER}\n${body}`, CONTEXT);
}

describe("parseZoneMapping", () => {
  it("resolves a valid row into names and marks it as a new link", () => {
    const { fileError, rows } = parse("dev-free,zone-lobby");

    expect(fileError).toBeNull();
    expect(rows).toEqual([
      {
        line: 2,
        deviceId: "dev-free",
        assetId: "zone-lobby",
        deviceName: "Free sensor",
        currentZone: null,
        targetZone: "Lobby",
        skipped: false,
        unchanged: false,
        error: null,
      },
    ]);
  });

  it("shows the zone a device is moving out of", () => {
    const [row] = parse("dev-lobby,zone-attic").rows;

    expect(row.currentZone).toBe("Lobby");
    expect(row.targetZone).toBe("Attic");
    expect(row.unchanged).toBe(false);
  });

  it("marks a device already in the target zone as unchanged", () => {
    const [row] = parse("dev-lobby,zone-lobby").rows;

    expect(row.unchanged).toBe(true);
    expect(row.error).toBeNull();
  });

  it("locates the columns by name, whatever their order", () => {
    const { rows } = parseZoneMapping(
      "asset_id,name,device_id\nzone-lobby,ignored,dev-free",
      CONTEXT,
    );

    expect(rows).toMatchObject([
      { deviceId: "dev-free", assetId: "zone-lobby", error: null },
    ]);
  });

  it.each([
    ["a missing device id", ",zone-lobby", "missingDeviceId"],
    ["an unknown device", "ghost,zone-lobby", "unknownDevice"],
    ["an unknown zone", "dev-free,ghost-zone", "unknownZone"],
  ])("flags %s", (_label, body, expected) => {
    expect(parse(body).rows[0].error).toBe(expected);
  });

  it.each([
    ["a blank zone id", "dev-lobby,"],
    ["a row that stops before the zone column", "dev-lobby"],
  ])("skips %s rather than failing it", (_label, body) => {
    const [row] = parse(body).rows;

    // The template ships one line per device: a line the operator did not
    // fill in must leave that device exactly where it is.
    expect(row.error).toBeNull();
    expect(row.skipped).toBe(true);
    expect(row.currentZone).toBe("Lobby");
  });

  it("does not let a blank line contradict the row that names a zone", () => {
    const { rows } = parse("dev-free,\ndev-free,zone-lobby");

    expect(rows.map((r) => r.error)).toEqual([null, null]);
    expect(rows.map((r) => r.skipped)).toEqual([true, false]);
  });

  it("flags both lines when one device is sent to two zones", () => {
    const { rows } = parse("dev-free,zone-lobby\ndev-free,zone-attic");

    expect(rows.map((r) => r.error)).toEqual([
      "conflictingRows",
      "conflictingRows",
    ]);
  });

  it("accepts a device repeated with the same zone", () => {
    const { rows } = parse("dev-free,zone-lobby\ndev-free,zone-lobby");

    expect(rows.map((r) => r.error)).toEqual([null, null]);
  });

  it("skips blank lines rather than reporting them", () => {
    const { rows } = parse("dev-free,zone-lobby\n\n,\n");

    expect(rows.map((r) => r.line)).toEqual([2]);
  });

  it("numbers rows by their line in the file, header included", () => {
    const { rows } = parse("dev-free,zone-lobby\ndev-lobby,zone-attic");

    expect(rows.map((r) => r.line)).toEqual([2, 3]);
  });

  it.each([
    ["an empty file", "", "empty"],
    ["a header with no data rows", HEADER, "empty"],
    [
      "a file without the expected columns",
      "id,zone\ndev-free,zone-lobby",
      "missingColumns",
    ],
  ])("rejects %s", (_label, text, expected) => {
    const { fileError, rows } = parseZoneMapping(text, CONTEXT);

    expect(fileError).toBe(expected);
    expect(rows).toEqual([]);
  });
});

describe("toAssignments", () => {
  it("keeps only clean rows and collapses exact duplicates", () => {
    const { rows } = parse(
      [
        "dev-free,zone-lobby",
        "dev-free,zone-lobby",
        "dev-lobby,zone-attic",
        "ghost,zone-lobby",
      ].join("\n"),
    );

    expect(toAssignments(rows)).toEqual([
      { device_id: "dev-free", asset_id: "zone-lobby" },
      { device_id: "dev-lobby", asset_id: "zone-attic" },
    ]);
  });

  it("leaves out the rows that name no zone", () => {
    const { rows } = parse("dev-lobby,\ndev-free,zone-lobby");

    expect(toAssignments(rows)).toEqual([
      { device_id: "dev-free", asset_id: "zone-lobby" },
    ]);
  });

  it("sends unchanged rows too, letting the server report them", () => {
    const { rows } = parse("dev-lobby,zone-lobby");

    expect(toAssignments(rows)).toEqual([
      { device_id: "dev-lobby", asset_id: "zone-lobby" },
    ]);
  });
});
