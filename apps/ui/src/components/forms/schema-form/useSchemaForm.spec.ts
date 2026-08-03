import { describe, expect, it } from "vitest";
import { normalizeSchema } from "./normalizeSchema";
import { schemaFormDefaults } from "./useSchemaForm";
import knxSchema from "./__fixtures__/transport-knx.json";
import mqttSchema from "./__fixtures__/transport-mqtt.json";

describe("schemaFormDefaults", () => {
  it("seeds schema defaults as actual values", () => {
    expect(schemaFormDefaults(normalizeSchema(mqttSchema))).toEqual({
      port: 1883,
      tls: false,
      tls_insecure: false,
    });
  });

  it("merges entity values over the defaults, dropping entity nulls", () => {
    const defaults = schemaFormDefaults(normalizeSchema(mqttSchema), {
      host: "broker",
      port: 8883,
      tls: true,
      ca_cert: null,
    });
    expect(defaults).toEqual({
      host: "broker",
      port: 8883,
      tls: true,
      tls_insecure: false,
    });
  });

  it("keeps entity values for unsupported fields so they round-trip", () => {
    const credentials = {
      device_authentication_password: "x",
      user_password: "y",
    };
    const defaults = schemaFormDefaults(normalizeSchema(knxSchema), {
      gateway_ip: "gw",
      secure_credentials: credentials,
    });
    expect(defaults.secure_credentials).toEqual(credentials);
  });
});
