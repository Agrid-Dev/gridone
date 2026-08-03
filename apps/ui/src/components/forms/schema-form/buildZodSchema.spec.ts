import { describe, expect, it } from "vitest";
import { buildZodSchema } from "./buildZodSchema";
import { normalizeSchema } from "./normalizeSchema";
import bacnetSchema from "./__fixtures__/transport-bacnet.json";
import knxSchema from "./__fixtures__/transport-knx.json";
import modbusSchema from "./__fixtures__/transport-modbus-tcp.json";
import mqttSchema from "./__fixtures__/transport-mqtt.json";
import changeEventSchema from "./__fixtures__/trigger-change-event.json";

const zodFor = (schema: unknown) => buildZodSchema(normalizeSchema(schema));

const issuesOf = (
  result: ReturnType<ReturnType<typeof zodFor>["safeParse"]>,
) =>
  result.success
    ? []
    : result.error.issues.map((i) => ({ path: i.path, message: i.message }));

describe("buildZodSchema — MQTT transport config", () => {
  const schema = zodFor(mqttSchema);

  it("accepts the minimal payload and applies schema defaults", () => {
    const result = schema.safeParse({ host: "broker.local" });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      host: "broker.local",
      port: 1883,
      tls: false,
      tls_insecure: false,
    });
  });

  it("rejects a missing required field on the field's path", () => {
    const issues = issuesOf(schema.safeParse({}));
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toEqual(["host"]);
  });

  it("accepts null and empty string for unwrapped optional fields", () => {
    // pydantic optional-T round-trips `null`; a cleared input yields "".
    expect(
      schema.safeParse({ host: "h", ca_cert: null, username: "" }).success,
    ).toBe(true);
  });

  it("rejects a non-positive port with the error on the field", () => {
    const issues = issuesOf(schema.safeParse({ host: "h", port: 0 }));
    expect(issues[0].path).toEqual(["port"]);
  });
});

describe("buildZodSchema — bounded ints and patterns", () => {
  it("enforces BACnet's 5–16 write priority with a field-level zod message", () => {
    const schema = zodFor(bacnetSchema);
    const issues = issuesOf(
      schema.safeParse({
        ip_with_mask: "10.0.0.1/24",
        default_write_priority: 20,
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toEqual(["default_write_priority"]);
    expect(issues[0].message).toMatch(/16/);
    expect(
      schema.safeParse({
        ip_with_mask: "10.0.0.1/24",
        default_write_priority: 5,
      }).success,
    ).toBe(true);
  });

  it("enforces the modbus host pattern with a field-level zod message", () => {
    const schema = zodFor(modbusSchema);
    const issues = issuesOf(schema.safeParse({ host: "tcp://plc.local" }));
    expect(issues[0].path).toEqual(["host"]);
    expect(schema.safeParse({ host: "192.168.1.10" }).success).toBe(true);
  });
});

describe("buildZodSchema — unsupported fields", () => {
  it("excludes them from validation but round-trips their values", () => {
    // KNX `secure_credentials` (nested object) can't be edited by the flat
    // form; a stored value must neither fail validation nor be stripped.
    const schema = zodFor(knxSchema);
    const stored = {
      gateway_ip: "gw.local",
      secure_credentials: {
        device_authentication_password: "x",
        user_password: "y",
      },
    };
    const result = schema.safeParse(stored);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject(stored);
  });

  it("does not require an unsupported optional field", () => {
    const schema = zodFor(changeEventSchema);
    expect(
      schema.safeParse({ device_id: "dev1", attribute: "temp" }).success,
    ).toBe(true);
  });
});

describe("buildZodSchema — enums", () => {
  it("accepts declared values and rejects others on the field's path", () => {
    const schema = zodFor(knxSchema);
    expect(
      schema.safeParse({ gateway_ip: "gw", tunneling_mode: "tcp" }).success,
    ).toBe(true);
    const issues = issuesOf(
      schema.safeParse({ gateway_ip: "gw", tunneling_mode: "spi" }),
    );
    expect(issues[0].path).toEqual(["tunneling_mode"]);
  });
});
