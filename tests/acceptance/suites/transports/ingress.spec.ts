import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { isGridoneError, type GridoneClient } from "@gridone/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseUrl, makeAdminClient, pollUntil } from "../../lib/api";
import { currentValue } from "../../lib/devices";

// Black-box run of the webhook ingress pipeline (AGR-955): driver loaded from
// YAML, transport-level auth, pushes over plain HTTP (no SDK involvement —
// producers integrate with the raw endpoint), decoded attributes, timeseries.

const runStart = new Date().toISOString();
const DRIVER_ID = "acceptance_webhook_room";
const SECRET = "acceptance-ingress-secret";
// Unique per run: on a non-fresh stack, devices from earlier runs still listen
// on their own topics, so per-run room ids keep `matched` counts deterministic.
const RUN = Date.now();
const ROOM_ID = `room-${RUN}`;

interface IngressResult {
  matched: number;
}

function snapshot(
  temperature: number,
  humidity: number,
  occupancy: boolean,
): string {
  return JSON.stringify({ temperature, humidity, occupancy });
}

async function push(
  transportId: string,
  topic: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${baseUrl}/transports/${transportId}/ingress/${topic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

const bearer = { Authorization: `Bearer ${SECRET}` };

describe("webhook ingress", () => {
  let client: GridoneClient;
  let transportId: string;
  let deviceId: string;
  const createdTransportIds: string[] = [];

  beforeAll(async () => {
    client = await makeAdminClient();

    const yaml = readFileSync(
      new URL("../../fixtures/webhook-room-driver.yaml", import.meta.url),
      "utf8",
    );
    try {
      await client.drivers.create(DRIVER_ID, { yaml });
    } catch (error) {
      const alreadyExists = isGridoneError(error) && error.status === 409;
      if (!alreadyExists) throw error;
    }

    const transport = await client.transports.create({
      name: `acceptance-webhook-${RUN}`,
      protocol: "webhook",
      config: { auth: "bearer", secret: SECRET },
    });
    transportId = transport.id;
    createdTransportIds.push(transportId);

    const device = await client.devices.create({
      name: `Webhook Room ${RUN}`,
      driver_id: DRIVER_ID,
      transport_id: transportId,
      config: { room_id: ROOM_ID },
    });
    deviceId = device.id;
  });

  // Everything here is named per run, so it would pile up on a long-lived
  // stack. Errors are swallowed so a failed cleanup can't mask a real failure,
  // and the device goes first: a transport still carrying devices won't drop.
  afterAll(async () => {
    if (deviceId) {
      await client.devices.delete(deviceId).catch(() => undefined);
    }
    while (createdTransportIds.length > 0) {
      const id = createdTransportIds.pop();
      if (id) await client.transports.delete(id).catch(() => undefined);
    }
  });

  it("rejects pushes without valid credentials with a generic 401", async () => {
    const missing = await push(
      transportId,
      `${ROOM_ID}/snapshot`,
      snapshot(21.5, 55, true),
    );
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ detail: "Unauthorized" });

    const wrong = await push(
      transportId,
      `${ROOM_ID}/snapshot`,
      snapshot(21.5, 55, true),
      { Authorization: "Bearer wrong-secret" },
    );
    expect(wrong.status).toBe(401);

    // The rejected pushes never reached the device.
    const device = await client.devices.get(deviceId);
    expect(currentValue(device, "temperature")).toBeNull();
  });

  it("decodes an authenticated snapshot into the device attributes", async () => {
    const response = await push(
      transportId,
      `${ROOM_ID}/snapshot`,
      snapshot(21.5, 55, true),
      bearer,
    );

    expect(response.status).toBe(200);
    // One listener per driver attribute subscribed to the rendered topic.
    expect((await response.json()) as IngressResult).toEqual({ matched: 3 });

    const device = await client.devices.get(deviceId);
    expect(currentValue(device, "temperature")).toBe(21.5);
    expect(currentValue(device, "humidity")).toBe(55);
    expect(currentValue(device, "occupancy")).toBe(true);
  });

  it("answers matched: 0 (not an error) on a topic nobody subscribes to", async () => {
    const response = await push(
      transportId,
      `${ROOM_ID}/unknown-topic`,
      snapshot(1, 2, false),
      bearer,
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as IngressResult).toEqual({ matched: 0 });
  });

  it("records pushed changes as timeseries points", async () => {
    const response = await push(
      transportId,
      `${ROOM_ID}/snapshot`,
      snapshot(23.5, 60, true),
      bearer,
    );
    expect(response.status).toBe(200);

    // The timeseries upsert is asynchronous (fire-and-forget listener).
    await pollUntil(
      () =>
        client.timeseries.getPoints(deviceId, "temperature", {
          start: runStart,
        }),
      (result) => result.points.some((point) => point.value === 23.5),
      { description: "pushed temperature 23.5 to land in timeseries" },
    );
  });

  it("rejects on-demand reads: the transport is push-only", async () => {
    let error: unknown = null;
    try {
      await client.request(
        "POST",
        `/devices/${deviceId}/attributes/temperature/refresh`,
      );
    } catch (caught) {
      error = caught;
    }
    expect(isGridoneError(error) && error.status === 422).toBe(true);

    // The last pushed value is untouched by the failed read.
    const device = await client.devices.get(deviceId);
    expect(currentValue(device, "temperature")).toBe(23.5);
  });

  it("caps the request body at 1 MiB", async () => {
    const oversized = "x".repeat(1024 * 1024 + 1);
    const response = await push(
      transportId,
      `${ROOM_ID}/snapshot`,
      oversized,
      bearer,
    );
    expect(response.status).toBe(413);
  });

  it("supports hmac_sha256 signatures (GitHub webhook convention)", async () => {
    const transport = await client.transports.create({
      name: `acceptance-webhook-hmac-${RUN}`,
      protocol: "webhook",
      config: { auth: "hmac_sha256", secret: SECRET },
    });
    createdTransportIds.push(transport.id);

    const body = snapshot(20, 50, false);
    const digest = createHmac("sha256", SECRET).update(body).digest("hex");

    const signed = await push(transport.id, "any/topic", body, {
      "x-signature-256": `sha256=${digest}`,
    });
    expect(signed.status).toBe(200);

    const badSignature = await push(transport.id, "any/topic", body, {
      "x-signature-256": `sha256=${"0".repeat(64)}`,
    });
    expect(badSignature.status).toBe(401);
  });
});
