import { readFileSync } from "node:fs";
import { isGridoneError, type GridoneClient } from "@gridone/sdk";
import type { TestProject } from "vitest/node";
import { makeAdminClient } from "../lib/api";

// Compose-internal addresses: gridone resolves the emulators by service name
// on the stack's bridge network (see ../compose.override.yaml).
const DRIVER_ID = "thermocktat_http";
const TRANSPORT_NAME = "acceptance-http";
const EMULATORS = [
  { name: "Thermocktat 0", ip: "http://thermocktat-http-0:8080" },
  { name: "Thermocktat 1", ip: "http://thermocktat-http-1:8080" },
];

declare module "vitest" {
  interface ProvidedContext {
    deviceIds: string[];
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

async function ensureDriver(client: GridoneClient): Promise<void> {
  const yaml = readFileSync(
    new URL("../fixtures/thermocktat-http-driver.yaml", import.meta.url),
    "utf8",
  );
  try {
    await client.drivers.create(DRIVER_ID, { yaml });
  } catch (error) {
    const alreadyExists = isGridoneError(error) && error.status === 409;
    if (!alreadyExists) throw error;
  }
}

async function ensureTransport(client: GridoneClient): Promise<string> {
  const transports = await client.transports.list();
  const existing = transports.find(
    (candidate) => candidate.name === TRANSPORT_NAME,
  );
  if (existing) {
    return existing.id;
  }
  const created = await client.transports.create({
    name: TRANSPORT_NAME,
    protocol: "http",
    config: {},
  });
  return created.id;
}

/**
 * Seeds the stack through the SDK: driver -> transport -> one device per
 * emulator. Runs once per vitest invocation; the stack is expected to be up
 * and healthy (compose owns readiness via `up --wait`). Each step is
 * get-or-create, so re-running against a non-fresh stack (local iteration
 * without a down/up cycle) reuses the existing resources instead of failing
 * on conflicts or piling up duplicates.
 */
export default async function globalSetup(project: TestProject): Promise<void> {
  const client = await step("login as default admin", makeAdminClient);

  await step(`create driver ${DRIVER_ID}`, () => ensureDriver(client));
  const transportId = await step("create http transport", () =>
    ensureTransport(client),
  );

  const existingDevices = await step("list existing devices", () =>
    client.devices.list({ driver_id: DRIVER_ID }),
  );

  const deviceIds: string[] = [];
  for (const emulator of EMULATORS) {
    const device =
      existingDevices.find((candidate) => candidate.name === emulator.name) ??
      (await step(`create device ${emulator.name}`, () =>
        client.devices.create({
          name: emulator.name,
          driver_id: DRIVER_ID,
          transport_id: transportId,
          config: { ip: emulator.ip },
        }),
      ));
    deviceIds.push(device.id);
  }

  project.provide("deviceIds", deviceIds);
}
