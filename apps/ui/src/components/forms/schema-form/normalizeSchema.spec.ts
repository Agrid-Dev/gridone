import { describe, expect, it } from "vitest";
import { normalizeProperty, normalizeSchema } from "./normalizeSchema";
import assetCreateSchema from "./__fixtures__/asset-create.json";
import bacnetSchema from "./__fixtures__/transport-bacnet.json";
import knxSchema from "./__fixtures__/transport-knx.json";
import mqttSchema from "./__fixtures__/transport-mqtt.json";
import changeEventSchema from "./__fixtures__/trigger-change-event.json";
import scheduleSchema from "./__fixtures__/trigger-schedule.json";

// Fixtures are real backend dumps (pydantic `model_json_schema()`), so a zod
// or backend upgrade changing the emitted shape is caught here in CI.

const fieldByName = (schema: unknown) => {
  const { fields } = normalizeSchema(schema);
  return Object.fromEntries(fields.map((f) => [f.name, f]));
};

describe("normalizeSchema — MQTT transport config", () => {
  const fields = fieldByName(mqttSchema);

  it("keeps every property, in declaration order", () => {
    expect(normalizeSchema(mqttSchema).fields.map((f) => f.name)).toEqual([
      "host",
      "port",
      "tls",
      "tls_insecure",
      "ca_cert",
      "client_cert",
      "client_key",
      "username",
      "password",
    ]);
  });

  it("classifies plain primitives and requiredness", () => {
    expect(fields.host).toMatchObject({
      kind: "string",
      required: true,
      nullable: false,
    });
    expect(fields.port).toMatchObject({
      kind: "integer",
      required: false,
      default: 1883,
    });
    expect(fields.tls).toMatchObject({ kind: "boolean", default: false });
    expect(fields.tls_insecure.kind).toBe("boolean");
  });

  it("unwraps anyOf [T, null] into optional-T and keeps vendor markers", () => {
    expect(fields.ca_cert).toMatchObject({
      kind: "string",
      nullable: true,
      multiline: true,
      required: false,
    });
    // The null default means "no default" for form seeding purposes.
    expect(fields.ca_cert.default).toBeUndefined();
    expect(fields.username).toMatchObject({
      kind: "string",
      nullable: true,
      multiline: false,
    });
  });
});

describe("normalizeSchema — KNX transport config", () => {
  const fields = fieldByName(knxSchema);

  it("classifies the enum property", () => {
    expect(fields.tunneling_mode).toMatchObject({
      kind: "enum",
      enumValues: ["udp", "tcp"],
      default: "udp",
    });
  });

  it("carries string constraints on the resolved node", () => {
    expect(fields.gateway_ip.schema).toMatchObject({
      pattern: "^[^\\s:/]+(\\.[^\\s:/]+)*$",
      minLength: 1,
    });
    expect(fields.gateway_ip.description).toContain("gateway");
  });

  it("normalizes the flat IP-Secure fields (AGR-920 flattening)", () => {
    expect(fields.secure_device_authentication_password).toMatchObject({
      kind: "string",
      required: false,
      nullable: true,
    });
    expect(fields.secure_user_password).toMatchObject({
      kind: "string",
      required: false,
      nullable: true,
    });
    expect(fields.secure_user_id).toMatchObject({
      kind: "integer",
      default: 2,
    });
  });
});

describe("normalizeSchema — BACnet transport config", () => {
  const fields = fieldByName(bacnetSchema);

  it("resolves $ref merged under sibling keywords", () => {
    // `default_write_priority` is `{$ref: BacnetWritePriority, default: 8}`:
    // the def brings the 5–16 bounds, the sibling keeps the default.
    expect(fields.default_write_priority).toMatchObject({
      kind: "integer",
      default: 8,
    });
    expect(fields.default_write_priority.schema).toMatchObject({
      minimum: 5,
      maximum: 16,
    });
  });
});

describe("normalizeSchema — AssetCreate (StrEnum via $ref)", () => {
  it("resolves the $ref'd enum def into an enum descriptor", () => {
    const fields = fieldByName(assetCreateSchema);
    expect(fields.type).toMatchObject({
      kind: "enum",
      required: true,
      label: "Type",
      enumValues: ["org", "building", "floor", "room", "zone"],
    });
  });
});

describe("normalizeSchema — trigger params schemas", () => {
  it("prefers the schema title over the derived label", () => {
    const fields = fieldByName(scheduleSchema);
    expect(fields.cron).toMatchObject({
      kind: "string",
      required: true,
      label: "Cron expression",
    });
  });

  it("classifies change_event's nested condition as unsupported", () => {
    const fields = fieldByName(changeEventSchema);
    expect(fields.device_id).toMatchObject({ kind: "string", required: true });
    expect(fields.condition.kind).toBe("unsupported");
  });
});

describe("normalizeSchema — arrays", () => {
  it("normalizes scalar items for repeatable rows", () => {
    const fields = fieldByName({
      type: "object",
      properties: {
        thresholds: {
          type: "array",
          items: { type: "number", minimum: 0 },
        },
      },
    });

    expect(fields.thresholds).toMatchObject({
      kind: "array",
      arrayItem: {
        kind: "scalar",
        field: { kind: "number", required: true },
      },
    });
  });

  it("normalizes flat object items and their required scalar fields", () => {
    const fields = fieldByName({
      type: "object",
      properties: {
        meters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              provider: { type: "string", enum: ["a", "b"] },
              point_id: { type: "string" },
            },
            required: ["provider", "point_id"],
          },
        },
      },
    });

    expect(fields.meters.kind).toBe("array");
    expect(fields.meters.arrayItem).toMatchObject({
      kind: "object",
      fields: [
        { name: "provider", kind: "enum", required: true },
        { name: "point_id", kind: "string", required: true },
      ],
    });
  });

  it("classifies deeper item shapes as unsupported", () => {
    const fields = fieldByName({
      type: "object",
      properties: {
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              metadata: { type: "object", properties: {} },
            },
          },
        },
      },
    });

    expect(fields.groups).toMatchObject({
      kind: "unsupported",
      arrayItem: undefined,
    });
  });
});

describe("normalizeSchema — degenerate inputs", () => {
  it.each([
    ["undefined", undefined],
    ["not an object", 42],
    ["no properties", { type: "object" }],
  ])("returns no fields for %s", (_label, schema) => {
    expect(normalizeSchema(schema).fields).toEqual([]);
  });

  it("classifies a multi-branch union as unsupported", () => {
    const descriptor = normalizeProperty("threshold", {
      anyOf: [{ type: "integer" }, { type: "string" }],
    });
    expect(descriptor.kind).toBe("unsupported");
  });

  it("falls back to a label derived from the property name", () => {
    const descriptor = normalizeProperty("gateway_ip", { type: "string" });
    expect(descriptor.label).toBe("Gateway Ip");
  });
});
