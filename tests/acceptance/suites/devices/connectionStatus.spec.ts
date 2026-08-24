import { describe, beforeAll, it, expect, inject } from "vitest";
import type { Device, GridoneClient, ConnectionStatus } from "@gridone/sdk";
import { makeAdminClient } from "../../lib/api";
import {
  startEmulator,
  stopEmulator,
  waitForEmulator,
} from "../../lib/emulator";

// gridone derives connection_status from the last N read outcomes of every
// attribute: one failed read makes the window mixed (degraded), a window of
// nothing but failures makes it error — and symmetrically on the way back up.
// So a flip costs one poll and a drain costs a full window, and every deadline
// below is that arithmetic. Keep them in step with the driver fixture
// (fixtures/thermocktat-http-driver-trimmed.yaml).
const POLL_INTERVAL_MS = 1_000;
const READ_WINDOW = 10;
// The timings above are deterministic, but a loaded CI box can delay a sweep
// and a spurious timeout costs a whole rerun.
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

function getConnectionStatus(device: Device): ConnectionStatus {
  return device.attributes!["connection_status"]!
    .current_value as ConnectionStatus;
}

describe("Connection status updates when device goes down and up", () => {
  let client: GridoneClient;

  const device = inject("devicesByProtocol")["http-connection-status"]?.[0];
  if (!device?.service) {
    throw new Error(
      "This suite needs a seeded device carrying its compose `service` " +
        "(see setup/globalSetup.ts)",
    );
  }
  // Destructured out of the seed: property narrowing doesn't survive into the
  // test callbacks below, plain consts do.
  const { id: deviceId, externalUrl, service } = device;

  const readStatus = async () =>
    getConnectionStatus(await client.devices.get(deviceId));

  async function startService() {
    await startEmulator(service);
    await waitForEmulator(externalUrl);
  }

  beforeAll(async () => {
    client = await makeAdminClient();
    await startService();

    // Longer than waitForEmulator's own deadline: vitest hooks time out at 10s
    // by default, which would kill this hook before the wait could report why.
  }, 40_000);

  // One journey, split for readability: the steps run in declaration order and
  // each one's precondition is the previous one's outcome.

  it("reports ok once the device is up", async () => {
    // A drain, not a flip: a previous run may have left the device climbing
    // back from error.
    await expect.poll(readStatus, UNTIL_DRAIN).toBe("ok");
  });

  // Device goes down

  it("degrades on the first failed poll", async () => {
    await stopEmulator(service);
    await expect.poll(readStatus, UNTIL_FLIP).toBe("degraded");
  });

  it("errors once the whole read window has failed", async () => {
    await expect.poll(readStatus, UNTIL_DRAIN).toBe("error");
  });

  // Device goes back up

  it("back to degraded on the first successful new poll", async () => {
    await startService();
    await expect.poll(readStatus, UNTIL_FLIP).toBe("degraded");
  });

  it("back to ok once window cleared", async () => {
    await expect.poll(readStatus, UNTIL_DRAIN).toBe("ok");
  });
});
