import { readFileSync } from "node:fs";
import {
  isGridoneError,
  type GridoneClient,
  type TransportCreate,
} from "@gridone/sdk";
import type { TestProject } from "vitest/node";
import { makeAdminClient } from "../lib/api";

interface DeviceSeed {
  name: string;
  config: Record<string, unknown>;
  /** Emulator http API published on the host — the suites' side-channel for
   *  external (non-gridone) state changes. */
  externalUrl: string;
}

export interface SeededDevice {
  id: string;
  externalUrl: string;
}

// TransportCreate's generated `config` is `Record<string, never>`: the API
// schema types it as the (empty) BaseTransportConfig instead of the
// per-protocol config union the endpoint actually accepts. Widen it here
// until the backend schema is fixed.
type TransportSeed = Omit<TransportCreate, "config"> & {
  config: Record<string, unknown>;
};

interface ProtocolSeed {
  /** Key under which the seeded device ids are provided to the suites. */
  protocol: string;
  driverId: string;
  driverFixture: string;
  transport: TransportSeed;
  devices: DeviceSeed[];
}

// Compose-internal addresses: gridone resolves the emulators by service name
// on the stack's bridge network (see ../compose.override.yaml).
const SEEDS: ProtocolSeed[] = [
  {
    protocol: "http",
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
    protocol: "modbus",
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
];

declare module "vitest" {
  interface ProvidedContext {
    devicesByProtocol: Record<string, SeededDevice[]>;
  }
}

async function step<T>(label: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new Error(`Seeding failed at "${label}": ${error}`, {
      cause: error,
    });
  }
}

async function ensureDriver(
  client: GridoneClient,
  seed: ProtocolSeed,
): Promise<void> {
  const yaml = readFileSync(
    new URL(`../fixtures/${seed.driverFixture}`, import.meta.url),
    "utf8",
  );
  try {
    await client.drivers.create(seed.driverId, { yaml });
  } catch (error) {
    const alreadyExists = isGridoneError(error) && error.status === 409;
    if (!alreadyExists) throw error;
  }
}

async function ensureTransport(
  client: GridoneClient,
  seed: ProtocolSeed,
): Promise<string> {
  const transports = await client.transports.list();
  const existing = transports.find(
    (candidate) => candidate.name === seed.transport.name,
  );
  if (existing) {
    return existing.id;
  }
  const created = await client.transports.create(
    seed.transport as TransportCreate,
  );
  return created.id;
}

async function seedProtocol(
  client: GridoneClient,
  seed: ProtocolSeed,
): Promise<SeededDevice[]> {
  await step(`create driver ${seed.driverId}`, () =>
    ensureDriver(client, seed),
  );
  const transportId = await step(
    `create transport ${seed.transport.name}`,
    () => ensureTransport(client, seed),
  );

  const existingDevices = await step(`list ${seed.protocol} devices`, () =>
    client.devices.list({ driver_id: seed.driverId }),
  );

  const seeded: SeededDevice[] = [];
  for (const device of seed.devices) {
    const found =
      existingDevices.find((candidate) => candidate.name === device.name) ??
      (await step(`create device ${device.name}`, () =>
        client.devices.create({
          name: device.name,
          driver_id: seed.driverId,
          transport_id: transportId,
          config: device.config,
        }),
      ));
    seeded.push({ id: found.id, externalUrl: device.externalUrl });
  }
  return seeded;
}

/**
 * Seeds the stack through the SDK: per protocol, driver -> transport -> one
 * device per emulator. Runs once per vitest invocation; the stack is expected
 * to be up and healthy (compose owns readiness via `up --wait`). Each step is
 * get-or-create, so re-running against a non-fresh stack (local iteration
 * without a down/up cycle) reuses the existing resources instead of failing
 * on conflicts or piling up duplicates.
 */
export default async function globalSetup(project: TestProject): Promise<void> {
  const client = await step("login as default admin", makeAdminClient);

  const devicesByProtocol: Record<string, SeededDevice[]> = {};
  for (const seed of SEEDS) {
    devicesByProtocol[seed.protocol] = await seedProtocol(client, seed);
  }

  project.provide("devicesByProtocol", devicesByProtocol);
}
