import type { TestProject } from "vitest/node";
import { makeAdminClient } from "../lib/api";
import {
  seedFixtureSet,
  step,
  type FixtureSet,
  type SeededDevice,
} from "../lib/fixtures";

/** Closed on purpose: a set only one suite needs is declared in that suite. */
export type SharedFixtureKey = "http" | "modbus" | "mqtt" | "knx" | "bacnet";

// Compose-internal addresses: gridone resolves the emulators by service name
// on the stack's bridge network (see ../compose.override.yaml).
const SHARED_FIXTURES: (FixtureSet & { key: SharedFixtureKey })[] = [
  {
    key: "http",
    driverId: "thermocktat_http",
    driverFixture: "thermocktat-http-driver.yaml",
    transport: { name: "acceptance-http", protocol: "http", config: {} },
    devices: [
      {
        name: "Thermocktat 0",
        config: { ip: "http://thermocktat-http-0:8080" },
        externalUrl: "http://localhost:9080",
      },
      {
        name: "Thermocktat 1",
        config: { ip: "http://thermocktat-http-1:8080" },
        externalUrl: "http://localhost:9081",
      },
    ],
  },
  {
    key: "modbus",
    driverId: "thermocktat_modbus",
    driverFixture: "thermocktat-modbus-driver.yaml",
    transport: {
      name: "acceptance-modbus-tcp",
      protocol: "modbus-tcp",
      config: { host: "thermocktat-modbus-0", port: 1502 },
    },
    // device_id is the Modbus unit id (thermocktat default: 4).
    devices: [
      {
        name: "Thermocktat Modbus 0",
        config: { device_id: 4 },
        externalUrl: "http://localhost:9082",
      },
    ],
  },
  {
    key: "mqtt",
    driverId: "thermocktat_mqtt",
    driverFixture: "thermocktat-mqtt-driver.yaml",
    transport: {
      name: "acceptance-mqtt",
      protocol: "mqtt",
      config: { host: "mqtt-broker", port: 1883 },
    },
    // device_id is the emulator's TMK_DEVICE_ID (topic segment).
    devices: [
      {
        name: "Thermocktat MQTT 0",
        config: { device_id: "TMK_mqtt_0" },
        externalUrl: "http://localhost:9083",
      },
    ],
  },
  {
    key: "knx",
    driverId: "thermocktat_knx",
    driverFixture: "thermocktat-knx-driver.yaml",
    transport: {
      name: "acceptance-knx",
      protocol: "knx",
      config: { gateway_ip: "thermocktat-knx-0", port: 3671 },
    },
    // Group address main/middle match the emulator defaults (1/0/x).
    devices: [
      {
        name: "Thermocktat KNX 0",
        config: { ga_main: "1", ga_middle: "0" },
        externalUrl: "http://localhost:9084",
      },
    ],
  },
  {
    key: "bacnet",
    driverId: "thermocktat_bacnet",
    driverFixture: "thermocktat-bacnet-driver.yaml",
    transport: {
      name: "acceptance-bacnet",
      protocol: "bacnet",
      // discovery_address is the emulator's pinned IP (compose.override.yaml):
      // the client sends a directed Who-Is there instead of a LAN broadcast.
      // ip_with_mask is required but unused on the directed path (the client
      // binds an ephemeral socket), so it just names the stack's subnet.
      config: {
        ip_with_mask: "172.30.0.0/24",
        discovery_address: "172.30.0.20",
        port: 47808,
      },
    },
    // device_instance matches the emulator's TMK_CONTROLLERS_BACNET_DEVICE_INSTANCE.
    devices: [
      {
        name: "Thermocktat BACnet 0",
        config: { device_instance: 1 },
        externalUrl: "http://localhost:9085",
      },
    ],
  },
];

declare module "vitest" {
  interface ProvidedContext {
    devicesByFixture: Record<SharedFixtureKey, SeededDevice[]>;
  }
}

/**
 * The stack must already be up — compose owns readiness via `up --wait`.
 *
 * Only add fixtures more than one suite depends on: a failure here fails the
 * whole run, and anything published here is breakable by every suite.
 */
export default async function globalSetup(project: TestProject): Promise<void> {
  const client = await step("login as default admin", makeAdminClient);

  const devicesByFixture = {} as Record<SharedFixtureKey, SeededDevice[]>;
  for (const seed of SHARED_FIXTURES) {
    devicesByFixture[seed.key] = await seedFixtureSet(client, seed);
  }

  project.provide("devicesByFixture", devicesByFixture);
}
