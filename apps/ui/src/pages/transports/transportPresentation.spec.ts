import { describe, expect, it } from "vitest";
import type { Device, Transport } from "@gridone/sdk";
import {
  presentTransportConfigValue,
  summarizeTransportDevices,
  transportEndpoint,
} from "./transportPresentation";

function device(id: string, transportId: string, driverId: string): Device {
  return {
    id,
    name: id,
    type: null,
    tags: {},
    driver_id: driverId,
    transport_id: transportId,
    config: {},
    attributes: {},
    is_faulty: false,
  };
}

function transport(
  protocol: Transport["protocol"],
  config: Record<string, unknown>,
): Transport {
  return {
    id: "tr-1",
    name: "Network",
    protocol,
    config,
    connection_state: { status: "ok" },
  } as Transport;
}

describe("summarizeTransportDevices", () => {
  it("counts devices and de-duplicates drivers per transport", () => {
    const result = summarizeTransportDevices([
      device("d1", "tr-1", "z-driver"),
      device("d2", "tr-1", "a-driver"),
      device("d3", "tr-1", "z-driver"),
      device("d4", "tr-2", "other-driver"),
    ]);

    expect(result.get("tr-1")).toEqual({
      count: 3,
      driverIds: ["a-driver", "z-driver"],
    });
    expect(result.get("tr-2")?.count).toBe(1);
  });
});

describe("transportEndpoint", () => {
  it.each([
    ["knx", { gateway_ip: "10.0.0.30" }, "10.0.0.30:3671"],
    ["mqtt", { host: "broker.local", port: 2883 }, "broker.local:2883"],
    ["modbus-tcp", { host: "10.0.0.21" }, "10.0.0.21:502"],
    ["bacnet", { ip_with_mask: "10.0.0.4/24" }, "10.0.0.4/24:47808"],
    ["http", { request_timeout: 10 }, null],
  ] as const)("presents the %s endpoint", (protocol, config, expected) => {
    expect(transportEndpoint(transport(protocol, config))).toBe(expected);
  });
});

describe("presentTransportConfigValue", () => {
  it("masks credential-like fields", () => {
    expect(presentTransportConfigValue("password", "hunter2", String)).toBe(
      "••••••••",
    );
    expect(presentTransportConfigValue("client_key", "private", String)).toBe(
      "••••••••",
    );
  });

  it("uses localized boolean labels", () => {
    expect(
      presentTransportConfigValue("tls", true, (value) =>
        value ? "Enabled" : "Disabled",
      ),
    ).toBe("Enabled");
  });
});
