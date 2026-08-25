import { describe, beforeAll, afterAll, it, expect } from "vitest";
import type {
  ConnectionStatus,
  Device,
  GridoneClient,
  MeResponse,
} from "@gridone/sdk";
import { makeAdminClient } from "../../lib/api";
import { startEmulator, waitForEmulator } from "../../lib/emulator";
import { seedFixtureSet, type FixtureSet } from "../../lib/fixtures";

// Suite-owned, not in globalSetup: this suite drives the setpoint across an
// automation's threshold, and the shared "http" devices are asserted against
// fixed values by goldenPath.ts — mutating them here would race that. Still
// the real driver (thermocktat_http), because the trigger needs a writable
// float attribute polled back from the emulator.
const SERVICE = "thermocktat-automations";
const EXTERNAL_URL = "http://localhost:9089";
const DEVICE_NAME = "Thermocktat automations";

const FIXTURE: FixtureSet = {
  key: "automations",
  driverId: "thermocktat_http",
  driverFixture: "thermocktat-http-driver.yaml",
  transport: {
    name: "acceptance-http-automations",
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

const POLL_INTERVAL_MS = 2_000; // thermocktat_http polls every 2s (fixtures/thermocktat-http-driver.yaml)
const READ_WINDOW = 10;
const SLACK_POLLS = 8;
const SAMPLE_MS = 250;
const UNTIL_DRAIN = {
  timeout: (READ_WINDOW + SLACK_POLLS) * POLL_INTERVAL_MS,
  interval: SAMPLE_MS,
};

// The scenario's threshold (AGR-712): the automation fires above 26, and the
// suite later drives the setpoint past it.
const SETPOINT_THRESHOLD = 26;

function connectionStatus(device: Device): ConnectionStatus {
  return device.attributes!["connection_status"]!
    .current_value as ConnectionStatus;
}

describe("Automations triggered by an attribute change", () => {
  let client: GridoneClient;
  let admin: MeResponse;
  let deviceId: string;

  // Suite-scoped, not drained per test like the CRUD suites do: this file is
  // one journey over a single automation, observed across steps.
  let automationId: string;

  const readDevice = () => client.devices.get(deviceId);
  const readConnectionStatus = async () => connectionStatus(await readDevice());

  beforeAll(async () => {
    client = await makeAdminClient();
    admin = await client.request<MeResponse>("GET", "/auth/me");
    await startEmulator(SERVICE);
    await waitForEmulator(EXTERNAL_URL);
    const [device] = await seedFixtureSet(client, FIXTURE);
    if (!device) {
      throw new Error(`Fixture set "${FIXTURE.key}" seeded no device`);
    }
    deviceId = device.id;
  }, 40_000);

  afterAll(async () => {
    // Before the device: the automation holds a live attribute listener on it.
    if (automationId) {
      await client.automations.delete(automationId).catch(() => undefined);
    }
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

  it("starts with the device reachable and reporting its setpoint", async () => {
    // A drain from a previous run's leftover failures, not necessarily a flip.
    await expect.poll(readConnectionStatus, UNTIL_DRAIN).toBe("ok");
    expect(
      (await readDevice()).attributes!["temperature_setpoint"]!.current_value,
    ).toEqual(expect.any(Number));
  });

  it("creates an automation that notifies when the setpoint goes above the threshold", async () => {
    // Provider ids and param shapes come from GET /automations/{triggers,actions}:
    // `change_event` takes `attribute` + `condition{operator,threshold}`, and the
    // action provider is `notification` (singular), whose params are all required.
    const automation = await client.automations.create({
      name: `Setpoint above ${SETPOINT_THRESHOLD} - ${Date.now()}`,
      enabled: true,
      trigger: {
        provider_id: "change_event",
        params: {
          device_id: deviceId,
          attribute: "temperature_setpoint",
          condition: { operator: "gt", threshold: SETPOINT_THRESHOLD },
        },
      },
      action: {
        provider_id: "notification",
        params: {
          title: `${DEVICE_NAME} setpoint too high`,
          body: `Setpoint went above ${SETPOINT_THRESHOLD}`,
          severity: "warning",
          user_ids: [admin.id],
        },
      },
    });
    // The wire schema leaves `id` optional; narrow it once here so the rest of
    // the suite (and the teardown) can address the automation.
    if (!automation.id) {
      throw new Error(
        `Automation "${automation.name}" was created without an id`,
      );
    }
    automationId = automation.id;

    // Read back rather than trusting the create response: registering the
    // trigger is what rejects malformed params, and it happens server-side.
    expect(await client.automations.get(automationId)).toMatchObject({
      id: automationId,
      enabled: true,
      trigger: { provider_id: "change_event" },
      action: { provider_id: "notification" },
    });
  });
});
