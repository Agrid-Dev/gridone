import { describe, beforeAll, it, expect } from "vitest";
import type { GridoneClient, ConnectionStatus } from "@gridone/sdk";
import { makeAdminClient } from "../../lib/api";
import {
  startEmulator,
  stopEmulator,
  waitForEmulator,
} from "../../lib/emulator";
import { seedFixtureSet, type FixtureSet } from "../../lib/fixtures";
import { currentValue } from "../../lib/devices";

// Suite-owned, not in globalSetup: this suite stops and starts its emulator,
// so no other suite may build on it.
const SERVICE = "thermocktat-connection-status";
const EXTERNAL_URL = "http://localhost:9087";

const FIXTURE: FixtureSet = {
  key: "connection-status",
  driverId: "thermocktat_http_trimmed",
  driverFixture: "thermocktat-http-driver-trimmed.yaml",
  transport: {
    name: "acceptance-http-connection-status",
    protocol: "http",
    config: {},
  },
  devices: [
    {
      name: "Thermocktat up and down",
      config: { ip: `http://${SERVICE}:8080` },
      externalUrl: EXTERNAL_URL,
    },
  ],
};

// connection_status comes from the last N read outcomes: one failure makes the
// window mixed (degraded), a full window of failures makes it error. So a flip
// costs one poll and a drain costs a window. Keep in step with the driver
// fixture (fixtures/thermocktat-http-driver-trimmed.yaml).
const POLL_INTERVAL_MS = 1_000;
const READ_WINDOW = 10;
// Slack for a loaded CI box; the timings themselves are deterministic.
const SLACK_POLLS = 8;
const SAMPLE_MS = 250;
const UNTIL_FLIP = {
  timeout: (1 + SLACK_POLLS) * POLL_INTERVAL_MS,
  interval: SAMPLE_MS,
};
const UNTIL_DRAIN = {
  timeout: (READ_WINDOW + SLACK_POLLS) * POLL_INTERVAL_MS,
  interval: SAMPLE_MS,
};

async function startService() {
  await startEmulator(SERVICE);
  await waitForEmulator(EXTERNAL_URL);
}

describe("Connection status updates when device goes down and up", () => {
  let client: GridoneClient;
  let deviceId: string;

  const readStatus = async () =>
    currentValue(
      await client.devices.get(deviceId),
      "connection_status",
    ) as ConnectionStatus;

  beforeAll(async () => {
    client = await makeAdminClient();
    await startService();

    const [device] = await seedFixtureSet(client, FIXTURE);
    if (!device) {
      throw new Error(`Fixture set "${FIXTURE.key}" seeded no device`);
    }
    deviceId = device.id;

    // Beats vitest's 10s hook default, which would fire before waitForEmulator.
  }, 40_000);

  // One journey: the steps run in declaration order, each precondition being
  // the previous step's outcome.

  it("reports ok once the device is up", async () => {
    // A drain, not a flip: a previous run may have left it climbing from error.
    await expect.poll(readStatus, UNTIL_DRAIN).toBe("ok");
  });

  it("degrades on the first failed poll", async () => {
    await stopEmulator(SERVICE);
    await expect.poll(readStatus, UNTIL_FLIP).toBe("degraded");
  });

  it("errors once the whole read window has failed", async () => {
    await expect.poll(readStatus, UNTIL_DRAIN).toBe("error");
  });

  it("back to degraded on the first successful new poll", async () => {
    await startService();
    await expect.poll(readStatus, UNTIL_FLIP).toBe("degraded");
  });

  it("back to ok once window cleared", async () => {
    await expect.poll(readStatus, UNTIL_DRAIN).toBe("ok");
  });
});
