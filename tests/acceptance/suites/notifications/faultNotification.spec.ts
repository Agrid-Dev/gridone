import { describe, beforeAll, afterAll, it, expect } from "vitest";
import type { Device, GridoneClient, NotificationDispatch } from "@gridone/sdk";
import { makeAdminClient, pollUntil } from "../../lib/api";
import { startEmulator, waitForEmulator } from "../../lib/emulator";
import { seedFixtureSet, type FixtureSet } from "../../lib/fixtures";

// Suite-owned, not in globalSetup: this suite flips the device's fault_code
// back and forth, so it needs its own device rather than one of the shared
// "http" fixture's — those are asserted "ok" once by goldenPath.ts, and
// mutating them here would race that assertion. Still the real driver
// (thermocktat_http), not a trimmed one: fault_code is `kind: fault` there.
const EXTERNAL_URL = "http://localhost:9088";
const DEVICE_NAME = "Thermocktat fault notification";
const SERVICE = "thermocktat-fault-notification";

const FIXTURE: FixtureSet = {
  key: "fault-notification",
  driverId: "thermocktat_http",
  driverFixture: "thermocktat-http-driver.yaml",
  transport: {
    name: "acceptance-http-fault-notification",
    protocol: "http",
    config: {},
  },
  devices: [
    {
      name: DEVICE_NAME,

      config: { ip: `http://${SERVICE}:8080` },
      externalUrl: EXTERNAL_URL,
    },
  ],
};

// Fault codes accepted by the emulator's `POST /v1/fault_code`, mirrored by
// the mapping codec in fixtures/thermocktat-http-driver.yaml.
const FAULT_CODE = { ok: 0, oops_error: 2 };

function faultCode(device: Device): string {
  return device.attributes!["fault_code"]!.current_value as string;
}

async function postFaultCode(code: number): Promise<Response> {
  return fetch(`${EXTERNAL_URL}/v1/fault_code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: code }),
  });
}

async function setFaultCode(code: number): Promise<void> {
  expect((await postFaultCode(code)).ok).toBe(true);
}

describe("Fault notifications dispatch on healthy/faulty transitions", () => {
  let client: GridoneClient;
  let deviceId: string;

  const readDevice = () => client.devices.get(deviceId);
  const readFaultCode = async () => faultCode(await readDevice());

  async function findNotification(
    title: string,
  ): Promise<NotificationDispatch | undefined> {
    const page = await client.notifications.list();
    return page.items.find((n) => n.notification.title === title);
  }

  async function waitForNotification(
    title: string,
  ): Promise<NotificationDispatch> {
    const found = await pollUntil(
      () => findNotification(title),
      (n) => n !== undefined,
      {
        description: `a "${title}" notification to be dispatched`,
      },
    );
    // pollUntil's predicate already narrowed this to defined.
    return found!;
  }

  beforeAll(async () => {
    client = await makeAdminClient();
    await startEmulator(SERVICE);
    await waitForEmulator(EXTERNAL_URL);
    const [device] = await seedFixtureSet(client, FIXTURE);
    if (!device) {
      throw new Error(`Fixture set "${FIXTURE.key}" seeded no device`);
    }
    deviceId = device.id;

    // Beats vitest's 10s hook default, which would fire before waitForEmulator.
  }, 40_000);

  afterAll(async () => {
    // The emulator outlives the device, and a fresh device inheriting a stale
    // fault would dispatch on its very first read.
    await postFaultCode(FAULT_CODE.ok).catch(() => undefined);
    if (deviceId) {
      await client.devices.delete(deviceId).catch(() => undefined);
    }
    // By name: seedFixtureSet returns devices, not the transport it reused.
    const transports = await client.transports.list().catch(() => []);
    const transport = transports.find(
      (candidate) => candidate.name === FIXTURE.transport.name,
    );
    if (transport) {
      await client.transports.delete(transport.id).catch(() => undefined);
    }
    // thermocktat_http stays: it is the shared golden-path driver.
  });

  // One journey: the steps run in declaration order, each precondition being
  // the previous step's outcome.

  it("starts healthy with no active fault", async () => {
    // A drain from a previous run's leftover fault, not necessarily a flip.
    await expect.poll(readFaultCode, { timeout: 20_000 }).toBe("ok");
    expect((await readDevice()).is_faulty).toBe(false);
  });

  it("dispatches a notification with the fault's severity when it becomes active", async () => {
    await setFaultCode(FAULT_CODE.oops_error);
    await expect.poll(readFaultCode, { timeout: 12_0000 }).toBe("oops_error");
    expect((await readDevice()).is_faulty).toBe(true);

    const dispatch = await waitForNotification(
      `New fault on ${DEVICE_NAME} (fault_code)`,
    );
    expect(dispatch.notification.severity).toBe("alert");
    expect(dispatch.notification.body).toContain("value: oops_error");
  });

  it("dispatches a resolution notification when the fault clears", async () => {
    await setFaultCode(FAULT_CODE.ok);
    await expect.poll(readFaultCode).toBe("ok");
    expect((await readDevice()).is_faulty).toBe(false);

    const dispatch = await waitForNotification(
      `Fault resolved on ${DEVICE_NAME} (fault_code)`,
    );
    expect(dispatch.notification.severity).toBe("info");
    expect(dispatch.notification.body).toContain("value: ok");
  });
});
