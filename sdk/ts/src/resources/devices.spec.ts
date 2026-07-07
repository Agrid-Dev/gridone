import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type {
  BatchDeviceCommand,
  DeviceCreate,
  DeviceUpdate,
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
    "list",
    (d) => d.list({ type: ["thermostat"], is_faulty: false }),
    [
      "GET",
      "/devices/",
      { searchParams: { type: ["thermostat"], is_faulty: false } },
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
    (d) => d.setTag("dev1", "zone", "roof"),
    ["PUT", "/devices/dev1/tags/zone", { body: { value: "roof" } }],
  ],
  [
    "deleteTag",
    (d) => d.deleteTag("dev1", "zone"),
    ["DELETE", "/devices/dev1/tags/zone"],
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

describe("DevicesResource", () => {
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
