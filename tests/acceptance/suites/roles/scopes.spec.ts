import { readFileSync } from "node:fs";
import { isGridoneError, type GridoneClient } from "@gridone/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  baseUrl,
  makeAdminClient,
  makeAdminClientWithToken,
  makeRoleUser,
  makeRoleUserWithToken,
  pollUntil,
} from "../../lib/api";
import { currentValue } from "../../lib/devices";
import { seedFixtureSet, type FixtureSet } from "../../lib/fixtures";
import { readThermocktat, writeThermocktat } from "../../lib/thermocktat";
import {
  authSubprotocols,
  collectMessagesOfType,
  openSocket,
} from "../../lib/websocket";

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
  let setpointReaderToken: string;
  let thermostatId: string;
  let thermostatUrl: string;
  let roomId: string;
  let roomTransportId: string;
  const userIds: string[] = [];
  const roleIds: string[] = [];

  beforeAll(async () => {
    admin = await makeAdminClient();

    const [thermostat] = await seedFixtureSet(admin, THERMOSTAT_FIXTURE);
    if (!thermostat) throw new Error("the scopes thermostat was not seeded");
    thermostatId = thermostat.id;
    thermostatUrl = thermostat.externalUrl;

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
    const setpoint = await makeRoleUserWithToken(setpointReaderRole.id);
    thermostatReader = reader.client;
    setpointReader = setpoint.client;
    setpointReaderToken = setpoint.accessToken;
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

  describe("the live feed", () => {
    const sockets: WebSocket[] = [];

    afterAll(() => {
      for (const socket of sockets) socket.close();
    });

    // Two sockets on the same device: the scoped one must receive updates
    // for a listed attribute and never for another, while an admin's gets
    // both. The emulator, not gridone, changes the values: the feed then
    // carries what the driver's poll observed. `temperature` itself is the
    // emulator's own ambient reading and cannot be driven, so delivery is
    // asserted on the other listed attribute, `temperature_setpoint`.
    it("delivers a scoped role the listed attributes only, per connection", async () => {
      const { accessToken: adminToken } = await makeAdminClientWithToken();
      const readerSocket = await openSocket(
        authSubprotocols(setpointReaderToken),
      );
      const adminSocket = await openSocket(authSubprotocols(adminToken));
      sockets.push(readerSocket, adminSocket);
      const readerFrames = collectMessagesOfType(readerSocket, "device_update");
      const adminFrames = collectMessagesOfType(adminSocket, "device_update");
      const forThermostat = (frames: Record<string, unknown>[]) =>
        frames.filter((f) => f.device_id === thermostatId);
      const attributesSeen = (frames: Record<string, unknown>[]) =>
        new Set(forThermostat(frames).map((f) => f.attribute));

      const state = await readThermocktat(thermostatUrl);
      await writeThermocktat(
        thermostatUrl,
        "temperature_setpoint",
        state.temperature_setpoint === 24 ? 25 : 24,
      );
      await writeThermocktat(
        thermostatUrl,
        "mode",
        state.mode === "heat" ? "cool" : "heat",
      );

      await pollUntil(
        async () => attributesSeen(adminFrames),
        (seen) => seen.has("temperature_setpoint") && seen.has("mode"),
        { description: "admin feed carries both updates" },
      );
      await pollUntil(
        async () => attributesSeen(readerFrames),
        (seen) => seen.has("temperature_setpoint"),
        { description: "scoped feed carries the setpoint update" },
      );

      const readerSaw = attributesSeen(readerFrames);
      expect(readerSaw.has("mode")).toBe(false);
      for (const attribute of readerSaw) {
        expect(["temperature", "temperature_setpoint"]).toContain(attribute);
      }
    });
  });

  // A devices:command scope narrows what a role may command, and commanding
  // implies reading. The receptionist is the example role of ADR 0004.
  describe("devices:command scopes", () => {
    const OTHER_DRIVER_ID = "thermocktat_http_scopes_other";
    let receptionist: GridoneClient;
    let receptionistId: string;
    let setpointCommander: GridoneClient;
    let driverCommander: GridoneClient;
    let operator: GridoneClient;
    let otherThermostatId: string;

    // The ids pin each multi-device target to this suite's thermostat:
    // other suites seed thermostats of their own on the same stack.
    const thermostats = () => ({ ids: [thermostatId], types: ["thermostat"] });
    const otherSetpoint = async () =>
      (await readThermocktat(thermostatUrl)).temperature_setpoint === 24
        ? 25
        : 24;

    beforeAll(async () => {
      const receptionistRole = await admin.users.createRole({
        id: `receptionist_${RUN}`,
        name: "Receptionist",
        permissions: [
          "devices:read",
          "devices:command",
          "timeseries:read",
          "dashboards:read",
        ],
        scopes: {
          "devices:read": [{ devices: { types: ["thermostat"] } }],
          "devices:command": [
            {
              devices: { types: ["thermostat"] },
              attributes: ["temperature_setpoint", "hvac_mode", "fan_speed"],
            },
          ],
        },
      });
      const setpointCommanderRole = await admin.users.createRole({
        id: `setpoint_commander_${RUN}`,
        name: "Setpoint commander",
        permissions: ["devices:command"],
        scopes: {
          "devices:command": [
            {
              devices: { types: ["thermostat"] },
              attributes: ["temperature_setpoint"],
            },
          ],
        },
      });
      const driverCommanderRole = await admin.users.createRole({
        id: `driver_commander_${RUN}`,
        name: "Driver commander",
        permissions: ["devices:read", "devices:command"],
        scopes: {
          "devices:command": [
            { devices: { driver_ids: [THERMOSTAT_FIXTURE.driverId] } },
          ],
        },
      });
      roleIds.push(
        receptionistRole.id,
        setpointCommanderRole.id,
        driverCommanderRole.id,
      );

      const receptionistUser = await makeRoleUser(receptionistRole.id);
      const setpointUser = await makeRoleUser(setpointCommanderRole.id);
      const driverUser = await makeRoleUser(driverCommanderRole.id);
      const operatorUser = await makeRoleUser("operator");
      receptionist = receptionistUser.client;
      receptionistId = receptionistUser.userId;
      setpointCommander = setpointUser.client;
      driverCommander = driverUser.client;
      operator = operatorUser.client;
      userIds.push(
        receptionistUser.userId,
        setpointUser.userId,
        driverUser.userId,
        operatorUser.userId,
      );

      // A second thermostat, same emulator, under another driver id: the
      // driver scope grants the first and not this one.
      const yaml = readFileSync(
        new URL(
          `../../fixtures/${THERMOSTAT_FIXTURE.driverFixture}`,
          import.meta.url,
        ),
        "utf8",
      ).replace(
        `id: ${THERMOSTAT_FIXTURE.driverId}\n`,
        `id: ${OTHER_DRIVER_ID}\n`,
      );
      try {
        await admin.drivers.create(OTHER_DRIVER_ID, { yaml });
      } catch (error) {
        const alreadyExists = isGridoneError(error) && error.status === 409;
        if (!alreadyExists) throw error;
      }
      const thermostat = await admin.devices.get(thermostatId);
      const other = await admin.devices.create({
        name: `Thermocktat scopes other ${RUN}`,
        driver_id: OTHER_DRIVER_ID,
        transport_id: thermostat.transport_id,
        config: { ip: "http://thermocktat-scopes:8080" },
      });
      otherThermostatId = other.id;
    });

    afterAll(async () => {
      if (otherThermostatId) {
        await admin.devices.delete(otherThermostatId).catch(() => undefined);
      }
    });

    it("serves write only on the attributes the role may command", async () => {
      const device = await receptionist.devices.get(thermostatId);

      expect(
        device.attributes?.temperature_setpoint?.read_write_modes,
      ).toContain("write");
      // Readable, not commandable: served as a read-only attribute.
      expect(device.attributes?.onoff_state?.read_write_modes).toEqual([
        "read",
      ]);
      expect(await statusOf(receptionist.devices.get(roomId))).toBe(404);
    });

    it("commands a granted attribute", async () => {
      const value = await otherSetpoint();

      await receptionist.devices.sendCommand(thermostatId, {
        attribute: "temperature_setpoint",
        value,
      });

      expect((await readThermocktat(thermostatUrl)).temperature_setpoint).toBe(
        value,
      );
    });

    it("refuses an attribute it reads but may not command, and writes nothing", async () => {
      const { enabled } = await readThermocktat(thermostatUrl);
      const command = { attribute: "onoff_state", value: !enabled };

      expect(
        await statusOf(
          receptionist.devices.previewDeviceCommand(thermostatId, command),
        ),
      ).toBe(403);
      expect(
        await statusOf(receptionist.devices.sendCommand(thermostatId, command)),
      ).toBe(403);
      expect((await readThermocktat(thermostatUrl)).enabled).toBe(enabled);
    });

    it("dispatches nothing in a batch on an attribute it may not command", async () => {
      const { enabled } = await readThermocktat(thermostatUrl);
      const batch = {
        target: thermostats(),
        attribute: "onoff_state",
        value: !enabled,
      };

      // The thermostat is excluded, which leaves no recipient.
      expect(await statusOf(receptionist.devices.sendBatchCommand(batch))).toBe(
        422,
      );
      const preview = await receptionist.devices.previewCommand(batch);
      expect(preview.members.map((m) => m.device_id)).not.toContain(
        thermostatId,
      );
      // "dispatches nothing": no command from this user ever reached it.
      const history = await admin.devices.listCommands({
        device_id: thermostatId,
        attribute: "onoff_state",
        user_id: receptionistId,
      });
      expect(history.total).toBe(0);
      expect((await readThermocktat(thermostatUrl)).enabled).toBe(enabled);
    });

    it("dispatches a batch on a granted attribute", async () => {
      const dispatch = await receptionist.devices.sendBatchCommand({
        target: thermostats(),
        attribute: "temperature_setpoint",
        value: await otherSetpoint(),
      });

      expect(dispatch.commands.map((c) => c.device_id)).toEqual([thermostatId]);
    });

    it("may neither save nor run a template on an attribute it may not command", async () => {
      const { enabled } = await readThermocktat(thermostatUrl);
      const template = {
        target: thermostats(),
        write: {
          attribute: "onoff_state",
          value: !enabled,
          data_type: "bool" as const,
        },
      };

      expect(
        await statusOf(receptionist.devices.commandTemplates.create(template)),
      ).toBe(422);
      const saved = await admin.devices.commandTemplates.create({
        ...template,
        name: `Switch scopes thermostat (${RUN})`,
      });
      expect(saved.write.attribute).toBe("onoff_state");
      // Running a template someone else saved is a write like any other.
      expect(
        await statusOf(
          receptionist.devices.commandTemplates.dispatch(saved.id),
        ),
      ).toBe(422);
      expect((await readThermocktat(thermostatUrl)).enabled).toBe(enabled);
    });

    it("reads, without devices:read, exactly the attributes it may command", async () => {
      const device = await setpointCommander.devices.get(thermostatId);

      expect(Object.keys(device.attributes ?? {})).toEqual([
        "temperature_setpoint",
      ]);
      expect(
        device.attributes?.temperature_setpoint?.read_write_modes,
      ).toContain("write");
      expect(await statusOf(setpointCommander.devices.get(roomId))).toBe(404);
    });

    it("writes only to the devices its scope grants", async () => {
      const dispatch = await driverCommander.devices.sendBatchCommand({
        target: { ids: [thermostatId, otherThermostatId] },
        attribute: "temperature_setpoint",
        value: await otherSetpoint(),
      });

      expect(dispatch.commands.map((c) => c.device_id)).toEqual([thermostatId]);
      // A saved target is dispatched later, by automations, over every
      // device: it may not reach one the role cannot command.
      expect(
        await statusOf(
          driverCommander.devices.commandTemplates.create({
            target: { ids: [thermostatId, otherThermostatId] },
            write: {
              attribute: "temperature_setpoint",
              value: 22,
              data_type: "float",
            },
          }),
        ),
      ).toBe(403);
    });

    it("leaves an unscoped operator every write", async () => {
      const { enabled } = await readThermocktat(thermostatUrl);

      const device = await operator.devices.get(thermostatId);
      expect(device.attributes?.onoff_state?.read_write_modes).toContain(
        "write",
      );
      await operator.devices.sendCommand(thermostatId, {
        attribute: "onoff_state",
        value: !enabled,
      });
      expect((await readThermocktat(thermostatUrl)).enabled).toBe(!enabled);
      const batch = await operator.devices.sendBatchCommand({
        target: thermostats(),
        attribute: "onoff_state",
        value: enabled,
      });
      expect(batch.commands.map((c) => c.device_id)).toEqual([thermostatId]);
      const template = await operator.devices.commandTemplates.create({
        target: thermostats(),
        write: { attribute: "onoff_state", value: enabled, data_type: "bool" },
      });
      expect(template.write.attribute).toBe("onoff_state");
    });
  });

  it("leaves an unscoped role's view untouched", async () => {
    const device = await admin.devices.get(thermostatId);

    expect(Object.keys(device.attributes ?? {})).toContain("mode");
    expect((await admin.devices.list()).map((d) => d.id)).toContain(roomId);
  });
});
