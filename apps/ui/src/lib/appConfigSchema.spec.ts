import { describe, expect, it } from "vitest";
import {
  defaultsFor,
  effectiveSchema,
  fieldsOf,
  findDiscriminant,
  localizeSchema,
  pickSchemaKeys,
  resolveLabel,
  toZodSchema,
  type AppSchemaNode,
} from "./appConfigSchema";

/** The Copilote schema from the app contract spec. */
const copiloteSchema: AppSchemaNode = {
  type: "object",
  properties: {
    poll_interval_seconds: {
      type: "integer",
      minimum: 30,
      default: 60,
      title: "poll_interval.title",
    },
    piloted_zones: {
      type: "array",
      items: { type: "string", format: "asset-id" },
      default: [],
      title: "piloted_zones.title",
      description: "piloted_zones.description",
    },
  },
  required: ["piloted_zones"],
  i18n: {
    en: {
      "poll_interval.title": "Polling interval (seconds)",
      "piloted_zones.title": "Piloted zones",
      "piloted_zones.description": "Select the zones the app may control.",
    },
    fr: {
      "poll_interval.title": "Période de lecture (secondes)",
      "piloted_zones.title": "Zones pilotées",
      "piloted_zones.description": "Zones que l'app a le droit de piloter.",
    },
  },
};

/** The PMS schema from the app contract spec — note that its `oneOf` branches
 *  declare no `type: object`, which is what forbids a plain union conversion. */
const pmsSchema: AppSchemaNode = {
  type: "object",
  properties: {
    sync_interval_seconds: { type: "integer", minimum: 60, default: 600 },
    provider: {
      type: "string",
      enum: ["apaleo", "mews"],
      title: "provider.title",
    },
  },
  required: ["provider"],
  oneOf: [
    {
      title: "Apaleo",
      properties: {
        provider: { const: "apaleo" },
        client_id: { type: "string", title: "Client ID" },
        client_secret: { type: "string", format: "password" },
      },
      required: ["client_id", "client_secret"],
    },
    {
      title: "Mews",
      properties: {
        provider: { const: "mews" },
        access_token: { type: "string", format: "password" },
      },
      required: ["access_token"],
    },
  ],
  i18n: { en: { "provider.title": "PMS provider" } },
};

describe("resolveLabel", () => {
  it("resolves a title through the catalog of the active locale", () => {
    expect(resolveLabel("piloted_zones.title", copiloteSchema.i18n, "fr")).toBe(
      "Zones pilotées",
    );
  });

  it("falls back to the base language of a regional locale", () => {
    expect(
      resolveLabel("poll_interval.title", copiloteSchema.i18n, "en-GB"),
    ).toBe("Polling interval (seconds)");
  });

  it("falls back to the literal title when the catalog has no entry", () => {
    expect(resolveLabel("Client ID", copiloteSchema.i18n, "en")).toBe(
      "Client ID",
    );
  });

  it("falls back to the literal title when the schema has no catalog", () => {
    expect(resolveLabel("Client ID", undefined, "en")).toBe("Client ID");
  });

  it("leaves an absent title absent", () => {
    expect(resolveLabel(undefined, copiloteSchema.i18n, "en")).toBeUndefined();
  });
});

describe("localizeSchema", () => {
  it("localizes titles inside flat object array items", () => {
    const localized = localizeSchema(
      {
        type: "object",
        properties: {
          meters: {
            type: "array",
            title: "meters.title",
            items: {
              type: "object",
              properties: {
                point_id: { type: "string", title: "point.title" },
              },
            },
          },
        },
      },
      {
        en: { "meters.title": "Meters", "point.title": "Point ID" },
      },
      "en",
    );

    expect(localized.properties?.meters.title).toBe("Meters");
    expect(localized.properties?.meters.items?.properties?.point_id.title).toBe(
      "Point ID",
    );
  });
});

describe("findDiscriminant", () => {
  it("finds the property every branch pins to a distinct const", () => {
    expect(findDiscriminant(pmsSchema)).toMatchObject({
      name: "provider",
      branches: [
        { value: "apaleo", title: "Apaleo" },
        { value: "mews", title: "Mews" },
      ],
    });
  });

  it("returns null on a schema without branches", () => {
    expect(findDiscriminant(copiloteSchema)).toBeNull();
  });

  it("returns null when a branch does not pin the candidate", () => {
    expect(
      findDiscriminant({
        oneOf: [
          { properties: { kind: { const: "a" } } },
          { properties: { other: { type: "string" } } },
        ],
      }),
    ).toBeNull();
  });

  it("returns null when two branches pin the same value", () => {
    expect(
      findDiscriminant({
        oneOf: [
          { properties: { kind: { const: "a" } } },
          { properties: { kind: { const: "a" } } },
        ],
      }),
    ).toBeNull();
  });
});

describe("effectiveSchema", () => {
  it("appends the selected branch's fields to the root ones", () => {
    const flat = effectiveSchema(pmsSchema, "apaleo");

    expect(Object.keys(flat.properties ?? {})).toEqual([
      "sync_interval_seconds",
      "provider",
      "client_id",
      "client_secret",
    ]);
    expect(flat.required).toEqual(["provider", "client_id", "client_secret"]);
    expect(flat.oneOf).toBeUndefined();
  });

  it("keeps the discriminant's root definition so it stays a dropdown", () => {
    const flat = effectiveSchema(pmsSchema, "mews");

    expect(flat.properties?.provider).toEqual(pmsSchema.properties?.provider);
    expect(Object.keys(flat.properties ?? {})).toContain("access_token");
    expect(Object.keys(flat.properties ?? {})).not.toContain("client_id");
  });

  it("keeps only the root fields while no branch is selected", () => {
    const flat = effectiveSchema(pmsSchema, undefined);

    expect(Object.keys(flat.properties ?? {})).toEqual([
      "sync_interval_seconds",
      "provider",
    ]);
    expect(flat.required).toEqual(["provider"]);
  });

  it("drops a required entry that names no property", () => {
    const flat = effectiveSchema(
      {
        type: "object",
        properties: { a: { type: "string" } },
        required: ["b"],
      },
      undefined,
    );

    expect(flat.required).toEqual([]);
  });

  it("passes a branchless schema through", () => {
    const flat = effectiveSchema(copiloteSchema, undefined);

    expect(Object.keys(flat.properties ?? {})).toEqual([
      "poll_interval_seconds",
      "piloted_zones",
    ]);
    expect(flat.required).toEqual(["piloted_zones"]);
  });
});

describe("fieldsOf", () => {
  it("returns properties in declaration order, flagging the required ones", () => {
    expect(fieldsOf(effectiveSchema(copiloteSchema, undefined))).toEqual([
      {
        name: "poll_interval_seconds",
        schema: copiloteSchema.properties?.poll_interval_seconds,
        required: false,
      },
      {
        name: "piloted_zones",
        schema: copiloteSchema.properties?.piloted_zones,
        required: true,
      },
    ]);
  });
});

describe("defaultsFor", () => {
  it("seeds declared defaults, and an empty list for arrays without one", () => {
    expect(
      defaultsFor({
        type: "object",
        properties: {
          poll_interval_seconds: { type: "integer", default: 60 },
          zones: { type: "array" },
          name: { type: "string" },
        },
      }),
    ).toEqual({ poll_interval_seconds: 60, zones: [] });
  });
});

describe("pickSchemaKeys", () => {
  it("drops the values of an abandoned branch", () => {
    const values = {
      provider: "mews",
      access_token: "tok",
      client_secret: "leftover",
    };

    expect(pickSchemaKeys(values, effectiveSchema(pmsSchema, "mews"))).toEqual({
      provider: "mews",
      access_token: "tok",
    });
  });

  it("omits keys the form never filled in", () => {
    expect(
      pickSchemaKeys({ provider: "mews" }, effectiveSchema(pmsSchema, "mews")),
    ).toEqual({ provider: "mews" });
  });
});

describe("toZodSchema", () => {
  it("accepts a payload matching the flattened branch", () => {
    const validator = toZodSchema(effectiveSchema(pmsSchema, "apaleo"));

    expect(
      validator.safeParse({
        sync_interval_seconds: 600,
        provider: "apaleo",
        client_id: "id",
        client_secret: "secret",
      }).success,
    ).toBe(true);
  });

  it("reports a missing branch field against that field", () => {
    const validator = toZodSchema(effectiveSchema(pmsSchema, "apaleo"));

    const result = validator.safeParse({ provider: "apaleo" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(
      "client_id",
    );
  });

  it("enforces the constraints of a branchless schema", () => {
    const validator = toZodSchema(effectiveSchema(copiloteSchema, undefined));

    expect(validator.safeParse({ piloted_zones: ["z1"] }).success).toBe(true);
    expect(
      validator.safeParse({ piloted_zones: ["z1"], poll_interval_seconds: 5 })
        .success,
    ).toBe(false);
  });

  it("lets a declared default stand in for a required field", () => {
    // `piloted_zones` is required *and* defaults to `[]`, so an empty payload
    // is complete — the same reading the server's validator takes.
    const validator = toZodSchema(effectiveSchema(copiloteSchema, undefined));

    expect(validator.safeParse({}).success).toBe(true);
  });

  it("reports a required field that declares no default", () => {
    const validator = toZodSchema(effectiveSchema(pmsSchema, undefined));

    const result = validator.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(
      "provider",
    );
  });

  it("accepts anything when the app serves a schema zod cannot convert", () => {
    const validator = toZodSchema({
      type: "object",
      properties: { broken: { type: "definitely-not-a-type" } },
    });

    expect(validator.safeParse({ broken: "anything" }).success).toBe(true);
  });
});
