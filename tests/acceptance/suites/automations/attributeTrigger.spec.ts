import { describe, beforeAll, afterAll, it, expect } from "vitest";
import type {
  ConnectionStatus,
  Device,
  GridoneClient,
  MeResponse,
  NotificationDispatch,
} from "@gridone/sdk";
import { makeAdminClient, pollUntil } from "../../lib/api";
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
const UNTIL_POLLED = {
  timeout: (1 + SLACK_POLLS) * POLL_INTERVAL_MS,
  interval: SAMPLE_MS,
};

// The scenario's threshold (AGR-712): the automation fires above 26, and the
// suite drives the setpoint from below it to 28. 28 is also the emulator's
// temperature_setpoint_max — a higher target would be clamped and never cross.
const SETPOINT_THRESHOLD = 26;
const SETPOINT_BELOW_THRESHOLD = 22;
const SETPOINT_ABOVE_THRESHOLD = 28;

// Notifications outlive the run — only `stack:down` wipes them — so an
// identical dispatch from an earlier run would satisfy the assertion below.
// This token, carried by the action's body, ties a dispatch to this run.
const RUN_ID = `run-${Date.now()}`;
const NOTIFICATION_TITLE = `${DEVICE_NAME} setpoint too high`;
const NOTIFICATION_BODY = `Setpoint went above ${SETPOINT_THRESHOLD} (${RUN_ID})`;
const NOTIFICATION_SEVERITY = "warning";

async function postSetpoint(value: number): Promise<Response> {
  return fetch(`${EXTERNAL_URL}/v1/temperature_setpoint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

async function setSetpoint(value: number): Promise<void> {
  expect((await postSetpoint(value)).ok).toBe(true);
}

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
  const readSetpoint = async () =>
    (await readDevice()).attributes!["temperature_setpoint"]!.current_value;

  // Identified by the run token in the body, not by title: the title is the
  // action's own wording and an earlier run wrote the same one.
  async function waitForActionNotification(): Promise<NotificationDispatch> {
    const dispatch = await pollUntil(
      async () => {
        const page = await client.notifications.list();
        return page.items.find((n) => n.notification.body.includes(RUN_ID));
      },
      (n) => n !== undefined,
      { description: `the automation's notification for ${RUN_ID}` },
    );
    // pollUntil's predicate already narrowed this to defined.
    return dispatch!;
  }

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
    // The emulator outlives the device, and the trigger fires on a *change*:
    // a setpoint left above the threshold would never cross it again.
    await postSetpoint(SETPOINT_BELOW_THRESHOLD).catch(() => undefined);
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

  it("starts with the device reachable and its setpoint below the threshold", async () => {
    // A drain from a previous run's leftover failures, not necessarily a flip.
    await expect.poll(readConnectionStatus, UNTIL_DRAIN).toBe("ok");
    // Established rather than asserted, and before the automation exists so
    // it cannot fire on this: a crashed previous run may have left the
    // setpoint above the threshold, and the trigger only fires on a crossing.
    await setSetpoint(SETPOINT_BELOW_THRESHOLD);
    await expect
      .poll(readSetpoint, UNTIL_POLLED)
      .toBe(SETPOINT_BELOW_THRESHOLD);
  });

  it("creates an automation that notifies when the setpoint goes above the threshold", async () => {
    // Provider ids and param shapes come from GET /automations/{triggers,actions}:
    // `change_event` takes `attribute` + `condition{operator,threshold}`, and the
    // action provider is `notification` (singular), whose params are all required.
    const automation = await client.automations.create({
      name: `Setpoint above ${SETPOINT_THRESHOLD} (${RUN_ID})`,
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
          title: NOTIFICATION_TITLE,
          body: NOTIFICATION_BODY,
          severity: NOTIFICATION_SEVERITY,
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

  it("raises the setpoint above the threshold, meeting the trigger's condition", async () => {
    await setSetpoint(SETPOINT_ABOVE_THRESHOLD);

    // Read back through gridone, not the emulator: the trigger listens to the
    // attribute the poll produces, so this is the moment its condition is met.
    await expect
      .poll(readSetpoint, UNTIL_POLLED)
      .toBe(SETPOINT_ABOVE_THRESHOLD);
  });

  it("dispatches the action's warning notification to the targeted user", async () => {
    const dispatch = await waitForActionNotification();

    expect(dispatch.notification.title).toBe(NOTIFICATION_TITLE);
    expect(dispatch.notification.body).toBe(NOTIFICATION_BODY);
    expect(dispatch.notification.severity).toBe(NOTIFICATION_SEVERITY);
    // The action names its recipients explicitly, so the dispatch is per-user.
    expect(dispatch.user_id).toBe(admin.id);
  });
});
