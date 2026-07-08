import { isGridoneError, type GridoneClient, type Transport } from "@gridone/sdk";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { makeAdminClient } from "../../lib/api";

// The config stores the cert verbatim (no X.509 parsing), so any PEM-shaped
// string exercises the partial-update path.
const CA_CERT =
  "-----BEGIN CERTIFICATE-----\nMIIBacceptancePlaceholderCert\n-----END CERTIFICATE-----";

// `Transport` is a protocol-discriminated union; narrow to the mqtt fields the
// assertions read.
type MqttConfigView = { host?: string; port?: number; ca_cert?: string | null };

function mqttConfig(transport: Transport): MqttConfigView {
  return transport.config as MqttConfigView;
}

describe("transports", () => {
  let client: GridoneClient;
  const createdIds: string[] = [];

  beforeAll(async () => {
    client = await makeAdminClient();
  });

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop();
      if (id) {
        await client.transports.delete(id).catch(() => undefined);
      }
    }
  });

  async function createMqttTransport(): Promise<string> {
    const created = await client.transports.create({
      name: `acceptance-transport-${createdIds.length}-${Date.now()}`,
      protocol: "mqtt",
      config: { host: "mqtt-broker", port: 1883 },
    });
    createdIds.push(created.id);
    return created.id;
  }

  it("creates a transport and reads it back", async () => {
    const id = await createMqttTransport();

    const fetched = await client.transports.get(id);

    expect(fetched.id).toBe(id);
    expect(fetched.protocol).toBe("mqtt");
    expect(mqttConfig(fetched).host).toBe("mqtt-broker");
  });

  it("applies a partial config update, merging into the existing config", async () => {
    // Regression (AGR-901): patching only `ca_cert` used to fail with a 422
    // because the config was validated against every protocol's config type.
    const id = await createMqttTransport();

    const updated = await client.transports.update(id, {
      config: { ca_cert: CA_CERT },
    });

    const config = mqttConfig(updated);
    expect(config.ca_cert).toBe(CA_CERT);
    // Untouched required fields survive the merge.
    expect(config.host).toBe("mqtt-broker");
    expect(config.port).toBe(1883);

    // The merge is persisted, not just echoed.
    expect(mqttConfig(await client.transports.get(id)).ca_cert).toBe(CA_CERT);
  });

  it("rejects an invalid partial config value with a 422", async () => {
    const id = await createMqttTransport();

    let error: unknown = null;
    try {
      await client.transports.update(id, { config: { port: "not-a-number" } });
    } catch (caught) {
      error = caught;
    }

    expect(isGridoneError(error) && error.status === 422).toBe(true);
  });
});
