import { describe, expect, it } from "vitest";
import { normalizeSchema } from "./normalizeSchema";
import { emptyOptionalsToNull, schemaFormDefaults } from "./useSchemaForm";
import mqttSchema from "./__fixtures__/transport-mqtt.json";
import knxSchema from "./__fixtures__/transport-knx.json";
import changeEventSchema from "./__fixtures__/trigger-change-event.json";

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
    const condition = { operator: "gt", threshold: 21 };
    const defaults = schemaFormDefaults(normalizeSchema(changeEventSchema), {
      device_id: "dev1",
      condition,
    });
    expect(defaults.condition).toEqual(condition);
  });

  it("seeds supported arrays for the empty-state renderer", () => {
    const normalized = normalizeSchema({
      type: "object",
      properties: {
        meters: { type: "array", items: { type: "string" } },
      },
    });

    expect(schemaFormDefaults(normalized)).toEqual({ meters: [] });
  });
});

describe("emptyOptionalsToNull", () => {
  it("maps cleared optional inputs to null so a PATCH unsets them", () => {
    const { fields } = normalizeSchema(knxSchema);
    const values = {
      gateway_ip: "gw.local",
      secure_device_authentication_password: "",
      secure_user_password: "",
      secure_user_id: 2,
    };

    expect(emptyOptionalsToNull(values, fields)).toEqual({
      gateway_ip: "gw.local",
      secure_device_authentication_password: null,
      secure_user_password: null,
      secure_user_id: 2,
    });
  });

  it("keeps empty strings on required fields — validation owns those", () => {
    const { fields } = normalizeSchema(mqttSchema);

    expect(emptyOptionalsToNull({ host: "", password: "" }, fields)).toEqual({
      host: "",
      password: null,
    });
  });

  it("leaves unsupported fields untouched so they round-trip verbatim", () => {
    const { fields } = normalizeSchema(changeEventSchema);

    expect(
      emptyOptionalsToNull({ device_id: "dev1", condition: "" }, fields),
    ).toEqual({ device_id: "dev1", condition: "" });
  });
});
