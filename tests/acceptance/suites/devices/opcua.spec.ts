import { readFileSync } from "node:fs";
import type { Device } from "@gridone/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { makeAdminClient, pollUntil } from "../../lib/api";
import { currentValue } from "./goldenPath";

const DRIVER_ID = "opcua_plc";
const OPCUA_ENDPOINT = "opc.tcp://opcua-plc:50000";

// Seeded here, not in setup/globalSetup.ts: a throw below must only fail this
// file, not the shared seeding step every other protocol suite depends on.
describe("opcua device", () => {
  let device: Device;

  beforeAll(async () => {
    const client = await makeAdminClient();

    const yaml = readFileSync(
      new URL("../../fixtures/opcua-plc-driver.yaml", import.meta.url),
      "utf8",
    );
    await client.drivers.create(DRIVER_ID, { yaml });

    // Raw request: the SDK's TransportCreate union doesn't have an "opcua"
    // variant yet.
    const transport = await client.request<{ id: string }>(
      "POST",
      "/transports/",
      {
        body: {
          name: "acceptance-opcua",
          protocol: "opcua",
          config: { endpoint_url: OPCUA_ENDPOINT },
        },
      },
    );

    device = await client.devices.create({
      name: "OPC-UA acceptance PLC",
      driver_id: DRIVER_ID,
      transport_id: transport.id,
      config: {},
    });

    // opc-plc zero-initializes numeric/bool nodes but leaves a fresh String
    // node's value unset (null) until first written — seed it so the read
    // test below observes a real string, not the device's pre-write state.
    await pollUntil(
      () => client.devices.get(device.id),
      (d) => currentValue(d, "acceptance_boolean") !== null,
      { description: "opcua device's first poll cycle to connect" },
    );
    await client.devices.sendCommand(device.id, {
      attribute: "acceptance_string",
      value: "acceptance-opcua",
      confirm: true,
    });
  });

  it("reads bool/int/float/string attributes from the emulator", async () => {
    const client = await makeAdminClient();
    const fresh = await client.devices.get(device.id);

    expect(typeof currentValue(fresh, "acceptance_boolean")).toBe("boolean");
    expect(typeof currentValue(fresh, "acceptance_int32")).toBe("number");
    expect(typeof currentValue(fresh, "acceptance_float")).toBe("number");
    expect(typeof currentValue(fresh, "acceptance_string")).toBe("string");
    expect(typeof currentValue(fresh, "server_service_level")).toBe("number");
    expect(typeof currentValue(fresh, "boiler_eu_range_low")).toBe("number");
  });

  it("writes a value and reads it back", async () => {
    const client = await makeAdminClient();
    const before = await client.devices.get(device.id);
    const target = currentValue(before, "acceptance_int32") === 1 ? 2 : 1;

    const command = await client.devices.sendCommand(device.id, {
      attribute: "acceptance_int32",
      value: target,
      confirm: true,
    });
    expect(command.status).toBe("success");

    const after = await client.devices.get(device.id);
    expect(currentValue(after, "acceptance_int32")).toBe(target);
  });

  // push_fast_uint's polling_group is 1h (see the driver fixture) — this
  // must fail red on a pull-only transport, since only push can surface a
  // change well before the next poll. Passes once AGR-988 adds subscription
  // support.
  it("reflects a device-side value change via push, not polling", async () => {
    const client = await makeAdminClient();
    const before = await client.devices.get(device.id);
    const initial = currentValue(before, "push_fast_uint");

    await pollUntil(
      () => client.devices.get(device.id),
      (d) => currentValue(d, "push_fast_uint") !== initial,
      {
        timeoutMs: 3_000,
        description: "push_fast_uint to change without polling",
      },
    );
  });
});
