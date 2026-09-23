import { readFileSync } from "node:fs";
import { isGridoneError, type GridoneClient } from "@gridone/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  baseUrl,
  makeAdminClient,
  makeRoleUser,
  pollUntil,
} from "../../lib/api";
import { currentValue } from "../../lib/devices";
import { seedFixtureSet, type FixtureSet } from "../../lib/fixtures";

// A devices:read scope narrows what a role is served, on every read path
// (AGR-1209, ADR 0004): what the role cannot read does not exist for it.
// Two devices tell the two selectors apart: a thermostat (typed driver) and a
// webhook room (untyped driver, reachable by driver id only).

const RUN = Date.now();

const THERMOSTAT_FIXTURE: FixtureSet = {
  key: "scopes",
  driverId: "thermocktat_http",
  driverFixture: "thermocktat-http-driver.yaml",
  transport: { name: "acceptance-http-scopes", protocol: "http", config: {} },
  devices: [
    {
      name: "Thermocktat scopes",
      config: { ip: "http://thermocktat-scopes:8080" },
      externalUrl: "http://localhost:9091",
    },
  ],
};

const ROOM_DRIVER_ID = "acceptance_webhook_room";
const ROOM_SECRET = "acceptance-scopes-secret";
const ROOM_ID = `room-scopes-${RUN}`;

async function statusOf(promise: Promise<unknown>): Promise<number | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return isGridoneError(error) ? error.status : null;
  }
}

describe("devices:read scopes", () => {
  let admin: GridoneClient;
  let thermostatReader: GridoneClient;
  let setpointReader: GridoneClient;
  let thermostatId: string;
  let roomId: string;
  let roomTransportId: string;
  const userIds: string[] = [];
  const roleIds: string[] = [];

  beforeAll(async () => {
    admin = await makeAdminClient();

    const [thermostat] = await seedFixtureSet(admin, THERMOSTAT_FIXTURE);
    if (!thermostat) throw new Error("the scopes thermostat was not seeded");
    thermostatId = thermostat.id;

    // The room device is the ingress suite's, seeded here per run: pushing one
    // snapshot gives it values, so hiding it is not hiding an empty device.
    const yaml = readFileSync(
      new URL("../../fixtures/webhook-room-driver.yaml", import.meta.url),
      "utf8",
    );
    try {
      await admin.drivers.create(ROOM_DRIVER_ID, { yaml });
    } catch (error) {
      const alreadyExists = isGridoneError(error) && error.status === 409;
      if (!alreadyExists) throw error;
    }
    const roomTransport = await admin.transports.create({
      name: `acceptance-webhook-scopes-${RUN}`,
      protocol: "webhook",
      config: { auth: "bearer", secret: ROOM_SECRET },
    });
    roomTransportId = roomTransport.id;
    const room = await admin.devices.create({
      name: `Webhook Room scopes ${RUN}`,
      driver_id: ROOM_DRIVER_ID,
      transport_id: roomTransportId,
      config: { room_id: ROOM_ID },
    });
    roomId = room.id;
    await fetch(
      `${baseUrl}/transports/${roomTransportId}/ingress/${ROOM_ID}/snapshot`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ROOM_SECRET}`,
        },
        body: JSON.stringify({
          temperature: 21.5,
          humidity: 40,
          occupancy: true,
        }),
      },
    );

    const thermostatReaderRole = await admin.users.createRole({
      id: `thermostat_reader_${RUN}`,
      name: "Thermostat reader",
      permissions: ["devices:read", "timeseries:read"],
      scopes: { "devices:read": [{ devices: { types: ["thermostat"] } }] },
    });
    const setpointReaderRole = await admin.users.createRole({
      id: `setpoint_reader_${RUN}`,
      name: "Setpoint reader",
      permissions: ["devices:read", "timeseries:read"],
      scopes: {
        "devices:read": [
          {
            devices: { types: ["thermostat"] },
            attributes: ["temperature", "temperature_setpoint"],
          },
        ],
      },
    });
    roleIds.push(thermostatReaderRole.id, setpointReaderRole.id);

    const reader = await makeRoleUser(thermostatReaderRole.id);
    const setpoint = await makeRoleUser(setpointReaderRole.id);
    thermostatReader = reader.client;
    setpointReader = setpoint.client;
    userIds.push(reader.userId, setpoint.userId);

    // Polled every 2s by the driver: wait for the first read so the
    // thermostat carries values and history before the assertions.
    await pollUntil(
      () => admin.devices.get(thermostatId),
      (device) => currentValue(device, "temperature_setpoint") !== null,
      { description: "thermostat first poll" },
    );
  });

  afterAll(async () => {
    for (const userId of userIds) {
      await admin.users.delete(userId).catch(() => undefined);
    }
    for (const roleId of roleIds) {
      await admin.users.deleteRole(roleId).catch(() => undefined);
    }
    if (roomId) await admin.devices.delete(roomId).catch(() => undefined);
    if (roomTransportId) {
      await admin.transports.delete(roomTransportId).catch(() => undefined);
    }
  });

  describe("a role scoped to thermostats", () => {
    it("lists the thermostat and not the room device", async () => {
      const ids = (await thermostatReader.devices.list()).map((d) => d.id);

      expect(ids).toContain(thermostatId);
      expect(ids).not.toContain(roomId);
    });

    it("answers not found for the room device", async () => {
      expect(await statusOf(thermostatReader.devices.get(roomId))).toBe(404);
    });

    it("reports no attribute coverage the room device alone exposes", async () => {
      const coverage = await thermostatReader.devices.listAttributes();
      const names = coverage.attributes.map((a) => a.attribute);

      expect(names).toContain("temperature_setpoint");
      expect(names).not.toContain("humidity");
      expect(names).not.toContain("occupancy");
    });

    it("has no history and no faults for the room device", async () => {
      expect(await statusOf(thermostatReader.timeseries.list(roomId))).toBe(
        404,
      );
      expect(
        await statusOf(
          thermostatReader.timeseries.getPoints(roomId, "temperature"),
        ),
      ).toBe(404);
      const faults = await thermostatReader.devices.listFaults();
      expect(faults.map((f) => f.device_id)).not.toContain(roomId);
    });
  });

  describe("a role scoped to two attributes of thermostats", () => {
    it("is served exactly those attributes", async () => {
      const device = await setpointReader.devices.get(thermostatId);

      expect(Object.keys(device.attributes ?? {}).sort()).toEqual([
        "temperature",
        "temperature_setpoint",
      ]);
    });

    it("sees the history of those attributes and none other", async () => {
      await pollUntil(
        () => admin.timeseries.list(thermostatId),
        (series) => series.some((s) => s.metric === "temperature_setpoint"),
        { description: "setpoint history" },
      );

      const metrics = (await setpointReader.timeseries.list(thermostatId)).map(
        (s) => s.metric,
      );
      expect(metrics).toContain("temperature_setpoint");
      expect(metrics).not.toContain("mode");
      expect(
        await statusOf(
          setpointReader.timeseries.getPoints(thermostatId, "mode"),
        ),
      ).toBe(404);
      expect(
        await statusOf(
          setpointReader.timeseries.getPoints(
            thermostatId,
            "temperature_setpoint",
          ),
        ),
      ).toBeNull();
    });
  });

  it("leaves an unscoped role's view untouched", async () => {
    const device = await admin.devices.get(thermostatId);

    expect(Object.keys(device.attributes ?? {})).toContain("mode");
    expect((await admin.devices.list()).map((d) => d.id)).toContain(roomId);
  });
});
