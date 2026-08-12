import { readFileSync } from "node:fs";
import type { Device } from "@gridone/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { makeAdminClient } from "../../lib/api";
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
  });

  it("reads bool/int/float/string attributes from the emulator", async () => {
    const client = await makeAdminClient();
    const fresh = await client.devices.get(device.id);

    expect(typeof currentValue(fresh, "acceptance_boolean")).toBe("boolean");
    expect(typeof currentValue(fresh, "acceptance_int32")).toBe("number");
    expect(typeof currentValue(fresh, "acceptance_float")).toBe("number");
    expect(typeof currentValue(fresh, "acceptance_string")).toBe("string");
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
});
