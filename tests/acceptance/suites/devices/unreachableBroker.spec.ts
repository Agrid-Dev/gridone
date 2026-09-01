import { describe, beforeAll, afterAll, it, expect } from "vitest";
import { isGridoneError, type Device, type GridoneClient } from "@gridone/sdk";
import { makeAdminClient } from "../../lib/api";
import { seedFixtureSet, type FixtureSet } from "../../lib/fixtures";

// A device's transport being down is an ordinary state for a BMS — a broker
// restarts, a gateway drops off the LAN — and it must not make provisioning
// fail. These tests pin that: writing a device is a storage operation, and it
// answers on its own terms rather than on whether the device could be reached.
//
// Suite-owned, not in globalSetup: the transport here deliberately points at
// nothing, so no other suite may build on it. The driver is the shared
// `thermocktat_mqtt` one (get-or-create), chosen because its reads are pure
// push with polling disabled — so registering listeners is the whole of its
// sync, and the unreachable broker is guaranteed to be on the write path
// rather than incidental to it.
const FIXTURE: FixtureSet = {
  key: "mqtt-unreachable",
  driverId: "thermocktat_mqtt",
  driverFixture: "thermocktat-mqtt-driver.yaml",
  transport: {
    name: "acceptance-mqtt-unreachable",
    protocol: "mqtt",
    // Inside the gridone container nothing listens here, so connecting is
    // refused immediately — no waiting out the transport's connect timeout.
    config: { host: "127.0.0.1", port: 1883 },
  },
  // Creating a device is the assertion, so the fixture must not create one.
  devices: [],
};

// Unique per run: the stack is ephemeral, but a re-run against a surviving one
// must not collide with the devices a previous run left behind.
const RUN = Date.now();
const DEVICE_NAME = `Unreachable broker ${RUN}`;
const RENAMED = `${DEVICE_NAME} renamed`;

describe("Devices on an unreachable broker", () => {
  let client: GridoneClient;
  let transportId: string;

  const makePayload = (name: string, deviceId: string) => ({
    name,
    driver_id: FIXTURE.driverId,
    transport_id: transportId,
    config: { device_id: deviceId },
  });

  /** This run's devices, read back through the API rather than carried over
   *  from the create call — so a step that fails cannot cascade a misleading
   *  failure into the next one. */
  const mine = async (): Promise<Device[]> => {
    const devices = await client.devices.list({ driver_id: FIXTURE.driverId });
    return devices.filter(
      (device) =>
        device.transport_id === transportId &&
        device.name.startsWith(DEVICE_NAME),
    );
  };

  beforeAll(async () => {
    client = await makeAdminClient();
    await seedFixtureSet(client, FIXTURE);
    const transports = await client.transports.list();
    const transport = transports.find((t) => t.name === FIXTURE.transport.name);
    if (!transport) {
      throw new Error(`Transport "${FIXTURE.transport.name}" was not seeded`);
    }
    transportId = transport.id;
  });

  afterAll(async () => {
    // Every step swallows its own failure so one stuck resource cannot mask
    // the test failure that left it behind (mirrors deleteFixtureSet).
    const devices = await client.devices
      .list({ driver_id: FIXTURE.driverId })
      .catch(() => []);
    for (const device of devices) {
      // By prefix, not by the two names the happy path produces: a regression
      // in the duplicate case would leave a third device behind, and teardown
      // has to drop that one too.
      if (device.name.startsWith(DEVICE_NAME)) {
        await client.devices.delete(device.id).catch(() => undefined);
      }
    }
    if (transportId) {
      await client.transports.delete(transportId).catch(() => undefined);
    }
  });

  // One journey: the steps run in declaration order, each precondition being
  // the previous step's outcome.

  it("creates the device instead of failing on the unreachable broker", async () => {
    const created = await client.devices.create(
      makePayload(DEVICE_NAME, `tmk_${RUN}`),
    );

    expect(created.id).toBeTruthy();
    expect(created.name).toBe(DEVICE_NAME);
    expect(created.transport_id).toBe(transportId);
  });

  it("persists exactly one device, whatever the create call reported", async () => {
    // Holds both before and after the fix, and that is the point: it is the
    // invariant the 500 violates in spirit — the write did happen — so it
    // guards the other half of the defect, that a retry after the error must
    // not leave a second device behind.
    expect(await mine()).toHaveLength(1);
  });

  it("renames the device instead of failing on the unreachable broker", async () => {
    const [device] = await mine();
    if (!device) {
      throw new Error("Precondition: the device was not created");
    }

    const updated = await client.devices.update(device.id, { name: RENAMED });

    expect(updated.id).toBe(device.id);
    expect(updated.name).toBe(RENAMED);
    expect((await client.devices.get(device.id)).name).toBe(RENAMED);
  });

  it("rejects a duplicate configuration with 409, not 500", async () => {
    // Already the backend's behaviour; pinned here because the UI is about to
    // surface it, so it must not quietly become a 500.
    const duplicate = client.devices.create(
      makePayload(`${DEVICE_NAME} duplicate`, `tmk_${RUN}`),
    );

    await expect(duplicate).rejects.toSatisfy(
      (error: unknown) => isGridoneError(error) && error.status === 409,
    );
  });
});
