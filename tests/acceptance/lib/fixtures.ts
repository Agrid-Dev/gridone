import { readFileSync } from "node:fs";
import {
  isGridoneError,
  type GridoneClient,
  type TransportCreate,
} from "@gridone/sdk";

export interface DeviceSeed {
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

/**
 * Grouped by fixture set rather than by protocol: the protocol belongs to the
 * transport, and more than one set can share one. Where a set is declared says
 * who owns it — see README, "Fixtures and their lifetime".
 */
export interface FixtureSet {
  /** Names the set in seeding errors, and keys shared sets in the context. */
  key: string;
  driverId: string;
  /** File name under `fixtures/`. */
  driverFixture: string;
  transport: TransportCreate;
  devices: DeviceSeed[];
}

export async function step<T>(
  label: string,
  action: () => Promise<T>,
): Promise<T> {
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
  seed: FixtureSet,
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
  seed: FixtureSet,
): Promise<string> {
  const transports = await client.transports.list();
  const existing = transports.find(
    (candidate) => candidate.name === seed.transport.name,
  );
  if (existing) {
    return existing.id;
  }
  const created = await client.transports.create(seed.transport);
  return created.id;
}

/**
 * Every step is get-or-create, so a non-fresh stack reuses what is there
 * instead of failing on conflicts. That idempotence is why seeding comes
 * through here rather than calling the resource endpoints directly.
 */
export async function seedFixtureSet(
  client: GridoneClient,
  seed: FixtureSet,
): Promise<SeededDevice[]> {
  await step(`create driver ${seed.driverId}`, () =>
    ensureDriver(client, seed),
  );
  const transportId = await step(
    `create transport ${seed.transport.name}`,
    () => ensureTransport(client, seed),
  );

  const existingDevices = await step(`list ${seed.key} devices`, () =>
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
