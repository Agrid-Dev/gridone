import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type {
  AssetAssignment,
  BatchDeviceCommand,
  Device,
  DeviceCreate,
  DeviceUpdate,
  DevicesPage,
  SingleDeviceCommand,
} from "../types";
import { CommandTemplatesResource } from "./commandTemplates";
import { DevicesResource } from "./devices";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return {
    devices: new DevicesResource(request as unknown as RequestFn),
    request,
  };
}

const CREATE: DeviceCreate = {
  name: "Fan",
  config: {},
  driver_id: "drv1",
  transport_id: "trp1",
};
const UPDATE: DeviceUpdate = { name: "Fan 2" };
const ASSIGNMENTS: AssetAssignment[] = [
  { device_id: "dev1", asset_id: "zone1" },
  { device_id: "dev2", asset_id: "zone2" },
];
const COMMAND: SingleDeviceCommand = {
  attribute: "setpoint",
  value: 21.5,
  confirm: true,
};
const BATCH: BatchDeviceCommand = {
  target: { ids: ["dev1", "dev2"] },
  attribute: "hvac_mode",
  value: "cool",
  confirm: true,
};

type Case = [
  string,
  (devices: DevicesResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  [
    "previewDeviceCommand",
    (d) => d.previewDeviceCommand("dev1", COMMAND),
    ["POST", "/devices/dev1/commands/preview", { body: COMMAND }],
  ],
  [
    "list",
    (d) => d.list({ type: ["thermostat"], is_faulty: false }),
    [
      "GET",
      "/devices/",
      { searchParams: { type: ["thermostat"], is_faulty: false } },
    ],
  ],
  [
    "listAttributes",
    (d) => d.listAttributes({ type: ["thermostat"] }),
    ["GET", "/devices/attributes", { searchParams: { type: ["thermostat"] } }],
  ],
  [
    "listTags",
    (d) => d.listTags({ tags: ["group:comfort"], driver_id: "drv1" }),
    [
      "GET",
      "/devices/tags",
      { searchParams: { tags: ["group:comfort"], driver_id: "drv1" } },
    ],
  ],
  ["get", (d) => d.get("dev1"), ["GET", "/devices/dev1"]],
  ["create", (d) => d.create(CREATE), ["POST", "/devices/", { body: CREATE }]],
  [
    "update",
    (d) => d.update("dev1", UPDATE),
    ["PATCH", "/devices/dev1", { body: UPDATE }],
  ],
  ["delete", (d) => d.delete("dev1"), ["DELETE", "/devices/dev1"]],
  [
    "setTag",
    (d) => d.setTag("dev1", "zone", ["roof"]),
    ["PUT", "/devices/dev1/tags/zone", { body: { values: ["roof"] } }],
  ],
  [
    "deleteTag",
    (d) => d.deleteTag("dev1", "zone"),
    ["DELETE", "/devices/dev1/tags/zone"],
  ],
  [
    "assignAssets",
    (d) => d.assignAssets(ASSIGNMENTS),
    [
      "POST",
      "/devices/asset-assignments",
      { body: { assignments: ASSIGNMENTS } },
    ],
  ],
  [
    "sendCommand",
    (d) => d.sendCommand("dev1", COMMAND),
    ["POST", "/devices/dev1/commands", { body: COMMAND }],
  ],
  [
    "sendBatchCommand",
    (d) => d.sendBatchCommand(BATCH),
    ["POST", "/devices/commands", { body: BATCH }],
  ],
  [
    "listCommands",
    (d) => d.listCommands({ device_id: "dev1", page: 2 }),
    [
      "GET",
      "/devices/commands",
      { searchParams: { device_id: "dev1", page: 2 } },
    ],
  ],
  [
    "listFaults",
    (d) => d.listFaults({ severity: "alert" }),
    ["GET", "/devices/faults/", { searchParams: { severity: "alert" } }],
  ],
  [
    "getStandardTypes",
    (d) => d.getStandardTypes(),
    ["GET", "/devices/standard-types"],
  ],
  [
    "getAttributeLogs",
    (d) => d.getAttributeLogs("dev1", "setpoint"),
    ["GET", "/devices/dev1/setpoint/logs"],
  ],
];

function device(id: string): Device {
  return {
    id,
    name: id,
    config: {},
    driver_id: "drv1",
    transport_id: "trp1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as Device;
}

function page(
  items: Device[],
  current: number,
  totalPages: number,
): DevicesPage {
  return {
    items,
    total: items.length * totalPages,
    page: current,
    size: items.length,
    total_pages: totalPages,
    links: { self: "s", first: "f", last: "l" },
    facets: {
      type: {},
      health: { healthy: 0, faulty: 0 },
      connection_status: { idle: 0, ok: 0, degraded: 0, error: 0 },
    },
  };
}

describe("DevicesResource", () => {
  it.each([{ ids: [] }, { type: [] }, { tags: [] }])(
    "does not serialize empty selection %j as an unrestricted GET",
    async (params) => {
      const { devices, request } = makeResource();

      await expect(devices.listAll(params)).resolves.toEqual([]);
      await expect(devices.listTags(params)).resolves.toEqual([]);
      const empty = await devices.list({ ...params, size: 20 });
      expect(empty.items).toEqual([]);
      expect([empty.total, empty.page, empty.size, empty.total_pages]).toEqual([
        0, 1, 20, 0,
      ]);
      expect(empty.facets.health).toEqual({ healthy: 0, faulty: 0 });
      expect(empty.facets.connection_status).toEqual({
        idle: 0,
        ok: 0,
        degraded: 0,
        error: 0,
      });

      expect(request).not.toHaveBeenCalled();
    },
  );

  it("listAll walks every page of the match at the largest size", async () => {
    const pages = [
      page([device("a"), device("b")], 1, 3),
      page([device("c"), device("d")], 2, 3),
      page([device("e")], 3, 3),
    ];
    const request = vi.fn(
      async (_m: string, _p: string, options) =>
        pages[(options.searchParams.page ?? 1) - 1],
    );
    const devices = new DevicesResource(request as unknown as RequestFn);

    const all = await devices.listAll({
      type: ["thermostat"],
      sort_by: "type",
    });

    expect(all.map((d) => d.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(request.mock.calls.map((call) => call[2].searchParams)).toEqual([
      { type: ["thermostat"], sort_by: "type", size: 500 },
      { type: ["thermostat"], sort_by: "type", size: 500, page: 2 },
      { type: ["thermostat"], sort_by: "type", size: 500, page: 3 },
    ]);
  });

  it("listAll reads a single page once, an empty match included", async () => {
    const request = vi.fn(async () => page([], 1, 0));
    const devices = new DevicesResource(request as unknown as RequestFn);

    await expect(devices.listAll()).resolves.toEqual([]);

    expect(request).toHaveBeenCalledOnce();
  });

  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { devices, request } = makeResource();

      await expect(invoke(devices)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );

  it("URL-encodes path parameters", async () => {
    const { devices, request } = makeResource();

    await devices.getAttributeLogs("dev/1", "flow rate");

    expect(request).toHaveBeenCalledWith(
      "GET",
      "/devices/dev%2F1/flow%20rate/logs",
    );
  });

  it("exposes command templates on the shared request function", async () => {
    const { devices, request } = makeResource();

    expect(devices.commandTemplates).toBeInstanceOf(CommandTemplatesResource);
    await devices.commandTemplates.get("tpl1");

    expect(request).toHaveBeenCalledWith(
      "GET",
      "/devices/commands/templates/tpl1",
    );
  });
});
