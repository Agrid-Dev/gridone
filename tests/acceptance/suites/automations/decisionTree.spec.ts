import { describe, beforeAll, afterAll, it, expect } from "vitest";
import type {
  AutomationExecution,
  ConnectionStatus,
  GridoneClient,
  MeResponse,
  UnitCommand,
} from "@gridone/sdk";
import { makeAdminClient, pollUntil } from "../../lib/api";
import {
  startEmulator,
  stopEmulator,
  waitForEmulator,
} from "../../lib/emulator";
import {
  deleteFixtureSet,
  seedFixtureSet,
  type FixtureSet,
} from "../../lib/fixtures";
import { currentValue } from "../../lib/devices";
import { readThermocktat, writeThermocktat } from "../../lib/thermocktat";

// Its own emulator, unlike the two sibling suites sharing
// thermocktat-automations: this journey powers the emulator down to prove
// that the first observation after a reconnection initializes an automation
// without firing it, and a sibling polling the same container would not
// survive the outage.
const SERVICE = "thermocktat-decision-tree";
const EXTERNAL_URL = "http://localhost:9092";
const DEVICE_NAME = "Thermocktat decision tree";

const FIXTURE: FixtureSet = {
  key: "automations-tree",
  driverId: "thermocktat_http",
  driverFixture: "thermocktat-http-driver.yaml",
  transport: {
    name: "acceptance-http-automations-tree",
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

// thermocktat_http polls every 2s (fixtures/thermocktat-http-driver.yaml) and
// connection_status is the verdict on the last 10 read outcomes: a flip costs
// one poll, a drain costs a whole window. Slack for a loaded CI box.
const POLL_INTERVAL_MS = 2_000;
const READ_WINDOW = 10;
const SLACK_POLLS = 8;
const SAMPLE_MS = 250;
const UNTIL_POLLED = {
  timeout: (1 + SLACK_POLLS) * POLL_INTERVAL_MS,
  interval: SAMPLE_MS,
};
const UNTIL_DRAIN = {
  timeout: (READ_WINDOW + SLACK_POLLS) * POLL_INTERVAL_MS,
  interval: SAMPLE_MS,
};

// Automations dispatch as the system actor, not as whoever saved them.
const SYSTEM_ACTOR = "system";
const RUN_ID = `run-${Date.now()}`;

// The tree: cooling wants the fan high, heating wants it low.
const fanFor = (mode: string) => (mode === "cool" ? "high" : "low");
const otherMode = (mode: string) => (mode === "cool" ? "heat" : "cool");

const setMode = (value: string) =>
  writeThermocktat(EXTERNAL_URL, "mode", value);
const setFanSpeed = (value: string) =>
  writeThermocktat(EXTERNAL_URL, "fan_speed", value);

const settle = () =>
  new Promise((resolve) => setTimeout(resolve, 2 * POLL_INTERVAL_MS));

describe("Automations deciding between cases", () => {
  let client: GridoneClient;
  let admin: MeResponse;
  let deviceId: string;
  // What the emulator reports right after a restart, hence what the device
  // reads first when it reconnects. The journey holds the other mode before
  // the outage so that reconnecting is a change.
  let defaultMode: string;
  let first: string;
  let second: string;
  let automationId: string;
  let caseId: Record<string, string>;
  let fanCommandsSeen = 0;

  const readDevice = () => client.devices.get(deviceId);
  const readMode = async () => currentValue(await readDevice(), "mode");
  const readFanSpeed = async () =>
    currentValue(await readDevice(), "fan_speed");
  const readConnectionStatus = async () =>
    currentValue(await readDevice(), "connection_status") as ConnectionStatus;
  const listRuns = (): Promise<AutomationExecution[]> =>
    client.automations.listExecutions(automationId);
  const listFanCommands = async (): Promise<UnitCommand[]> =>
    (
      await client.devices.listCommands({
        device_id: deviceId,
        attribute: "fan_speed",
      })
    ).items;
  const successfulRuns = async () =>
    (await listRuns()).filter((run) => run.status === "success");

  beforeAll(async () => {
    client = await makeAdminClient();
    admin = await client.request<MeResponse>("GET", "/auth/me");
    // A restart brings the emulator back to its built-in state whatever a
    // previous run left behind; the reconnection steps rely on that state.
    await stopEmulator(SERVICE);
    await startEmulator(SERVICE);
    await waitForEmulator(EXTERNAL_URL);
    defaultMode = (await readThermocktat(EXTERNAL_URL)).mode;
    first = otherMode(defaultMode);
    second = otherMode(first);
    const [device] = await seedFixtureSet(client, FIXTURE);
    if (!device) {
      throw new Error(`Fixture set "${FIXTURE.key}" seeded no device`);
    }
    deviceId = device.id;
  }, 60_000);

  afterAll(async () => {
    // Before the device: the automation holds a live attribute listener on it.
    if (automationId) {
      await client.automations.delete(automationId).catch(() => undefined);
    }
    await deleteFixtureSet(client, FIXTURE);
  });

  // One journey: the steps run in declaration order, each precondition being
  // the previous step's outcome.

  it("starts with the device reachable, in a mode whose fan is set", async () => {
    await expect.poll(readConnectionStatus, UNTIL_DRAIN).toBe("ok");
    await setMode(first);
    await setFanSpeed(fanFor(first));
    await expect.poll(readMode, UNTIL_POLLED).toBe(first);
    await expect.poll(readFanSpeed, UNTIL_POLLED).toBe(fanFor(first));
  });

  it("creates a decision tree whose cases set the fan from the new mode", async () => {
    // Two cases on the event's own value, each ending in an inline write on
    // the triggering device (`device_id: null`), the command action's second
    // shape: no template involved.
    const automation = await client.automations.create({
      name: `Fan follows mode (${RUN_ID})`,
      enabled: true,
      trigger: {
        provider_id: "change_event",
        params: { device_id: deviceId, attribute: "mode" },
      },
      branches: [
        {
          name: "Cooling",
          condition: { op: "eq", left: { event: "value" }, right: "cool" },
          action: {
            provider_id: "command_template",
            params: { device_id: null, attribute: "fan_speed", value: "high" },
          },
        },
        {
          name: "Heating",
          condition: { op: "eq", left: { event: "value" }, right: "heat" },
          action: {
            provider_id: "command_template",
            params: { device_id: null, attribute: "fan_speed", value: "low" },
          },
        },
      ],
    });
    if (!automation.id) {
      throw new Error(
        `Automation "${automation.name}" was created without an id`,
      );
    }
    automationId = automation.id;
    const [cooling, heating] = automation.branches;
    if (!cooling?.id || !heating?.id) {
      throw new Error("The created tree came back without branch ids");
    }
    caseId = { cool: cooling.id, heat: heating.id };

    // Read back rather than trusting the create response: registering the
    // trigger is what rejects malformed params, and it happens server-side.
    expect(await client.automations.get(automationId)).toMatchObject({
      id: automationId,
      enabled: true,
      deactivation: null,
      branches: [
        { id: caseId.cool, name: "Cooling" },
        { id: caseId.heat, name: "Heating" },
      ],
    });
  });

  it("follows the first true case and writes the fan through the command service", async () => {
    await setMode(second);

    const commands = await pollUntil(
      listFanCommands,
      (items) =>
        items.some(
          (command) =>
            command.value === fanFor(second) && command.status === "success",
        ),
      { description: `the automation's fan_speed=${fanFor(second)} command` },
    );
    // Scoped to this device and attribute, so nothing a sibling suite
    // dispatched can satisfy it.
    const command = commands.find(
      (item) => item.value === fanFor(second) && item.status === "success",
    );
    expect(command).toMatchObject({
      device_id: deviceId,
      attribute: "fan_speed",
      value: fanFor(second),
      // The automation writes as the system actor, without a template.
      user_id: SYSTEM_ACTOR,
      template_id: null,
      status: "success",
    });
    // The emulator itself took the write: the record is not the only trace.
    await expect.poll(readFanSpeed, UNTIL_POLLED).toBe(fanFor(second));

    const [run] = await pollUntil(successfulRuns, (runs) => runs.length >= 1, {
      description: "the run that wrote the fan",
    });
    if (!run) throw new Error("pollUntil returned no run");
    expect(run.branch_id).toBe(caseId[second]);
    // The first case is tested first; the second only when the first is false.
    expect(run.branches?.map((branch) => branch.result)).toEqual(
      second === "cool" ? ["matched"] : ["not_matched", "matched"],
    );
    expect(run.context).toMatchObject({
      device_id: deviceId,
      attribute: "mode",
      previous_value: first,
      value: second,
      is_initial: false,
    });
  });

  it("follows the other case when the mode changes back", async () => {
    await setMode(first);
    await expect.poll(readFanSpeed, UNTIL_POLLED).toBe(fanFor(first));

    // Newest first.
    const [latest] = await pollUntil(
      successfulRuns,
      (items) => items.length >= 2,
      { description: "the second successful run" },
    );
    if (!latest) throw new Error("pollUntil returned no run");
    expect(latest).toMatchObject({
      status: "success",
      branch_id: caseId[first],
    });
    expect(latest.branches?.map((branch) => branch.result)).toEqual(
      first === "cool" ? ["matched"] : ["not_matched", "matched"],
    );
    fanCommandsSeen = (await listFanCommands()).length;
  });

  it("disables with a reason that names who stopped it, and stays silent", async () => {
    const disabled = await client.automations.disable(
      automationId,
      "Maintenance",
    );
    expect(disabled).toMatchObject({
      enabled: false,
      deactivation: {
        reason: "Maintenance",
        actor_id: admin.id,
        source: "operator",
      },
    });
    const runsBefore = (await listRuns()).length;

    await setMode(second);
    await expect.poll(readMode, UNTIL_POLLED).toBe(second);
    await settle();
    expect((await listRuns()).length).toBe(runsBefore);
    expect((await listFanCommands()).length).toBe(fanCommandsSeen);
    expect(await readFanSpeed()).toBe(fanFor(first));
  });

  it("enables again without sending anything, then listens", async () => {
    const enabled = await client.automations.enable(automationId);
    expect(enabled).toMatchObject({ enabled: true, deactivation: null });
    await settle();
    // Enabling neither replays the change missed while disabled nor writes.
    expect((await listFanCommands()).length).toBe(fanCommandsSeen);

    await setMode(first);
    await pollUntil(
      listFanCommands,
      (items) => items.length > fanCommandsSeen,
      {
        description: "a fan command once the automation listens again",
      },
    );
    fanCommandsSeen = (await listFanCommands()).length;
  });

  it("loses the device while its emulator is down", async () => {
    await stopEmulator(SERVICE);
    await expect.poll(readConnectionStatus, UNTIL_DRAIN).toBe("error");
  });

  it("gets the device back once the emulator is up", async () => {
    await startEmulator(SERVICE);
    await waitForEmulator(EXTERNAL_URL);
    await expect.poll(readConnectionStatus, UNTIL_DRAIN).toBe("ok");
  });

  it("initializes without acting on the first observation after the reconnection", async () => {
    // The emulator came back in its built-in mode, which differs from the one
    // the journey held: a change, but the first one since the outage.
    expect(defaultMode).not.toBe(first);
    await expect.poll(readMode, UNTIL_POLLED).toBe(defaultMode);

    const runs = await pollUntil(
      listRuns,
      (items) => items.some((run) => run.status === "initialized"),
      { description: "an initialized run after the reconnection" },
    );
    const initialized = runs.find((run) => run.status === "initialized");
    expect(initialized).toMatchObject({
      status: "initialized",
      reason: "first_observation",
    });
    expect(initialized?.context).toMatchObject({
      device_id: deviceId,
      attribute: "mode",
      value: defaultMode,
      is_initial: true,
    });
    expect((await listFanCommands()).length).toBe(fanCommandsSeen);
  });
});
