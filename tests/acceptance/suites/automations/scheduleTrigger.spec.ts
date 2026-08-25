import { describe, beforeAll, afterAll, it, expect } from "vitest";
import type {
  CommandTemplateResponse,
  ConnectionStatus,
  GridoneClient,
} from "@gridone/sdk";
import { makeAdminClient, pollUntil } from "../../lib/api";
import { startEmulator, waitForEmulator } from "../../lib/emulator";
import {
  deleteFixtureSet,
  seedFixtureSet,
  type FixtureSet,
} from "../../lib/fixtures";
import { currentValue } from "../../lib/devices";
import { writeThermocktat } from "../../lib/thermocktat";

// Shares attributeTrigger.spec.ts's emulator (compose service
// thermocktat-automations) but owns its own device and transport, and drives a
// different attribute — onoff_state here, temperature_setpoint there. That is
// what keeps the two files independent while vitest runs them in parallel.
const SERVICE = "thermocktat-automations";
const EXTERNAL_URL = "http://localhost:9089";
const DEVICE_NAME = "Thermocktat schedule automations";

const FIXTURE: FixtureSet = {
  key: "automations-schedule",
  driverId: "thermocktat_http",
  driverFixture: "thermocktat-http-driver.yaml",
  transport: {
    name: "acceptance-http-automations-schedule",
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

// croniter reads the seconds field LAST, so this is every 5 seconds. The
// intuitive `*/5 * * * * *` is every second with a 5-minute stride — a trap
// worth naming, since both expressions validate.
const CRON_EVERY_5_SECONDS = "* * * * * */5";

// thermocktat_http polls every 2s (fixtures/thermocktat-http-driver.yaml) and
// connection_status is the verdict on the last 10 read outcomes, so climbing
// out of a previous run's `error` costs a whole window, not a single poll.
// Slack for a loaded CI box; the timings themselves are deterministic.
const POLL_INTERVAL_MS = 2_000;
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

// Automations dispatch as the system actor, not as whoever saved them.
const SYSTEM_ACTOR = "system";

// Templates are listed by name; a run's own name keeps re-runs from colliding.
const RUN_ID = `run-${Date.now()}`;

const setEnabled = (value: boolean) =>
  writeThermocktat(EXTERNAL_URL, "enabled", value);

describe("Automations triggered on a schedule", () => {
  let client: GridoneClient;
  let deviceId: string;
  let template: CommandTemplateResponse;
  let automationId: string;

  const readDevice = () => client.devices.get(deviceId);
  const readOnOff = async () => currentValue(await readDevice(), "onoff_state");
  const readConnectionStatus = async () =>
    currentValue(await readDevice(), "connection_status") as ConnectionStatus;

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
    // First, and before anything else touches the device: while it lives, the
    // schedule keeps firing every 5 seconds.
    if (automationId) {
      await client.automations.delete(automationId).catch(() => undefined);
    }
    // The emulator outlives the device, and this suite leaves it switched off.
    await setEnabled(true).catch(() => undefined);
    if (template) {
      await client.devices.commandTemplates
        .delete(template.id)
        .catch(() => undefined);
    }
    await deleteFixtureSet(client, FIXTURE);
  });

  // One journey: the steps run in declaration order, each precondition being
  // the previous step's outcome.

  it("starts with the device reachable and switched on", async () => {
    // A drain from a previous run's leftover failures, not necessarily a flip.
    await expect.poll(readConnectionStatus, UNTIL_DRAIN).toBe("ok");
    await setEnabled(true);
    await expect.poll(readOnOff, UNTIL_POLLED).toBe(true);
  });

  it("saves a command template that switches the device off", async () => {
    // The action provider dispatches a *saved* template by id, so the template
    // is the automation's payload and has to exist first.
    template = await client.devices.commandTemplates.create({
      name: `Switch off on schedule (${RUN_ID})`,
      target: { ids: [deviceId] },
      write: { attribute: "onoff_state", value: false, data_type: "bool" },
    });

    expect(template.id).toBeTruthy();
    expect(
      await client.devices.commandTemplates.get(template.id),
    ).toMatchObject({
      id: template.id,
      write: { attribute: "onoff_state", value: false },
    });
  });

  it("creates an automation that runs the template every 5 seconds", async () => {
    const automation = await client.automations.create({
      name: `Switch off every 5s (${RUN_ID})`,
      enabled: true,
      trigger: {
        provider_id: "schedule",
        params: { cron: CRON_EVERY_5_SECONDS },
      },
      action: {
        provider_id: "command_template",
        params: { template_id: template.id },
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
    // trigger is what rejects a malformed cron, and it happens server-side.
    expect(await client.automations.get(automationId)).toMatchObject({
      id: automationId,
      enabled: true,
      trigger: {
        provider_id: "schedule",
        params: { cron: CRON_EVERY_5_SECONDS },
      },
      action: { provider_id: "command_template" },
    });
  });

  it("records the dispatched command in the history", async () => {
    // Scoped to this run's template, so nothing an earlier run or a sibling
    // suite dispatched can satisfy it.
    const history = await pollUntil(
      () => client.devices.listCommands({ template_id: template.id }),
      (page) => page.items.length > 0,
      { description: `a command dispatched by template ${template.id}` },
    );

    const [command] = history.items;
    expect(command).toMatchObject({
      template_id: template.id,
      device_id: deviceId,
      attribute: "onoff_state",
      value: false,
      // The schedule fires as the system actor, not as the admin who saved it.
      user_id: SYSTEM_ACTOR,
      // Not merely queued: the write reached the device.
      status: "success",
    });
  });
});
