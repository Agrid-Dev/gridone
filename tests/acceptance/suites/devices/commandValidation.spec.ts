import { describe, beforeAll, afterAll, it, expect } from "vitest";
import { isGridoneError, type GridoneClient } from "@gridone/sdk";
import { makeAdminClient } from "../../lib/api";
import { startEmulator, waitForEmulator } from "../../lib/emulator";
import {
  deleteFixtureSet,
  seedFixtureSet,
  type FixtureSet,
} from "../../lib/fixtures";
import { currentValue } from "../../lib/devices";
import { readThermocktat, writeThermocktat } from "../../lib/thermocktat";

// Suite-owned driver AND device: the rules in the fixture change what writes
// the driver accepts, and thermocktat_http is shared with goldenPath.ts and
// the automations suites. Own emulator too: this suite drives onoff_state and
// temperature_setpoint, both already claimed on the other emulators.
const SERVICE = "thermocktat-command-rules";
const EXTERNAL_URL = "http://localhost:9090";
const DRIVER_ID = "thermocktat_http_rules";
const DEVICE_NAME = "Thermocktat command rules";

// The reason codes authored in fixtures/thermocktat-http-rules-driver.yaml.
const LOCKED = "setpoint_locked_while_running";
const LOCKED_MESSAGE = "Turn the thermostat off before changing the setpoint";
const FAN_HIGH_BLOCKED = "fan_high_requires_power";

const FIXTURE: FixtureSet = {
  key: "command-rules",
  driverId: DRIVER_ID,
  driverFixture: "thermocktat-http-rules-driver.yaml",
  transport: {
    name: "acceptance-http-command-rules",
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

const POLL_INTERVAL_MS = 2_000; // the fixture polls every 2s
const SLACK_POLLS = 8;
const SAMPLE_MS = 250;
const UNTIL_POLLED = {
  timeout: (1 + SLACK_POLLS) * POLL_INTERVAL_MS,
  interval: SAMPLE_MS,
};

// Inside the emulator's default band (16–28), so only the rule can refuse it.
const TARGET = 23;

describe("Driver-authored command rules gate previews and writes", () => {
  let client: GridoneClient;
  let deviceId: string;

  const readDevice = () => client.devices.get(deviceId);
  const readOnoff = async () => currentValue(await readDevice(), "onoff_state");
  const readSetpoint = async () =>
    currentValue(await readDevice(), "temperature_setpoint");
  const previewSetpoint = () =>
    client.devices.previewDeviceCommand(deviceId, {
      attribute: "temperature_setpoint",
      value: TARGET,
    });
  const sendSetpoint = () =>
    client.devices.sendCommand(deviceId, {
      attribute: "temperature_setpoint",
      value: TARGET,
      confirm: true,
    });
  // A rejection is the interesting outcome here, so it is caught as a value:
  // `rejects.toThrow()` would lose the structured reasons on the error.
  const rejectionOf = (request: Promise<unknown>) =>
    request.then(
      () => undefined,
      (error: unknown) => error,
    );

  beforeAll(async () => {
    client = await makeAdminClient();
    await startEmulator(SERVICE);
    await waitForEmulator(EXTERNAL_URL);
    const [device] = await seedFixtureSet(client, FIXTURE);
    if (!device) {
      throw new Error(`Fixture set "${FIXTURE.key}" seeded no device`);
    }
    deviceId = device.id;
  }, 40_000);

  afterAll(async () => {
    // The emulator outlives the device; leave it unlocked for the next run.
    await writeThermocktat(EXTERNAL_URL, "enabled", false).catch(
      () => undefined,
    );
    await deleteFixtureSet(client, FIXTURE);
  });

  // One journey: the steps run in declaration order, each precondition being
  // the previous step's outcome.

  it("starts with the sibling flag set and observed by gridone", async () => {
    // Established, not asserted: the emulator boots with `enabled` false, and
    // the rule can only refuse once gridone has observed the sibling.
    await writeThermocktat(EXTERNAL_URL, "enabled", true);
    await expect.poll(readOnoff, UNTIL_POLLED).toBe(true);
  });

  it("previews the setpoint as ineligible with the authored reason", async () => {
    const preview = await previewSetpoint();
    expect(preview.eligible).toBe(false);
    expect(preview.reasons?.map((reason) => reason.code)).toContain(LOCKED);
    expect(preview.reasons?.[0]?.message?.default).toBe(LOCKED_MESSAGE);
    // The projection refuses the attribute before any candidate is proposed.
    expect(preview.write_state?.status).toBe("blocked");

    // The option whose condition holds stays available; the others are listed
    // and refused, not hidden.
    const fan = await client.devices.previewDeviceCommand(deviceId, {
      attribute: "fan_speed",
      value: "low",
    });
    expect(fan.eligible).toBe(true);
    const high = fan.write_state?.options?.find(
      (option) => option.value === "high",
    );
    expect(high?.available).toBe(true);
  });

  it("refuses the submitted command with 422 and records a terminal error", async () => {
    const before = await readThermocktat(EXTERNAL_URL);

    const rejection = await rejectionOf(sendSetpoint());
    expect(isGridoneError(rejection)).toBe(true);
    if (!isGridoneError(rejection)) throw rejection;
    expect(rejection.status).toBe(422);
    expect(rejection.detail).toBe("Command rejected");
    // The authored codes ride in `reasons`: the 422 detail is a plain string.
    expect(rejection.reasons?.map((reason) => reason.code)).toContain(LOCKED);

    // A refusal is history, not silence: a terminal error row carrying the
    // structured verdict, never sent to the transport.
    const history = await client.devices.listCommands({
      device_id: deviceId,
      attribute: "temperature_setpoint",
      sort: "desc",
    });
    const refused = history.items[0];
    expect(refused?.status).toBe("error");
    expect(refused?.status_details).toBe("Command rejected");
    expect(refused?.value).toBe(TARGET);
    expect(refused?.validation?.eligible).toBe(false);
    expect(
      refused?.validation?.reasons?.map((reason) => reason.code),
    ).toContain(LOCKED);

    // The device was never written: the emulator still holds its own value.
    const after = await readThermocktat(EXTERNAL_URL);
    expect(after.temperature_setpoint).toBe(before.temperature_setpoint);
    expect(after.temperature_setpoint).not.toBe(TARGET);
  });

  it("clears the sibling flag and the same command goes through", async () => {
    // Behind gridone's back, as a person in the building would.
    await writeThermocktat(EXTERNAL_URL, "enabled", false);
    await expect.poll(readOnoff, UNTIL_POLLED).toBe(false);
    await expect
      .poll(async () => (await previewSetpoint()).eligible, UNTIL_POLLED)
      .toBe(true);

    const command = await sendSetpoint();
    expect(command.status).toBe("success");
    expect(command.value).toBe(TARGET);
    // Commands confirm in their response: a plain read reflects the write.
    expect(await readSetpoint()).toBe(TARGET);
    expect((await readThermocktat(EXTERNAL_URL)).temperature_setpoint).toBe(
      TARGET,
    );
  });

  it("refuses an option whose condition no longer holds", async () => {
    // With the thermostat off, `high` is listed but unavailable, and the
    // submission is refused with the option's own reason.
    const fan = await client.devices.previewDeviceCommand(deviceId, {
      attribute: "fan_speed",
      value: "high",
    });
    expect(fan.eligible).toBe(false);
    expect(fan.reasons?.map((reason) => reason.code)).toContain(
      FAN_HIGH_BLOCKED,
    );
    const rejection = await rejectionOf(
      client.devices.sendCommand(deviceId, {
        attribute: "fan_speed",
        value: "high",
        confirm: true,
      }),
    );
    if (!isGridoneError(rejection)) throw rejection;
    expect(rejection.status).toBe(422);
    expect(rejection.reasons?.map((reason) => reason.code)).toContain(
      FAN_HIGH_BLOCKED,
    );
  });
});
