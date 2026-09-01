import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import type { WidgetFormState } from "./WidgetForm";

vi.mock("react-i18next", () =>
  createI18nMock({ "widgets.fields.title": "Title" }),
);

// The chart editor fetches devices, coverage and the operator matrix; stand
// those in so this stays a test of which editor the form chooses and of the
// form's own validation, not of their behaviour.
vi.mock("@/components/forms/targetPicker", () => ({
  AttributeTargetPicker: () => <div data-testid="attribute-target-picker" />,
  toPickerTarget: (value: unknown) => {
    if (typeof value !== "object" || value === null) return { devices: {} };
    const { devices, attribute } = value as {
      devices?: unknown;
      attribute?: string;
    };
    return { devices: devices ?? {}, attribute };
  },
  useAttributeCoverage: () => ({
    coverage: [],
    totalDevices: 0,
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices: [], loading: false, error: null }),
}));
vi.mock("@/hooks/useAggregateOptions", () => ({
  useAggregateOptions: () => ({ data: undefined }),
  operatorsFor: () => [],
  spaceOperatorsFor: () => [],
  useResetRefusedOperator: () => {},
}));
vi.mock("./views/useTagGroups", () => ({
  useTagGroups: () => ({
    groups: [],
    totalDevices: 0,
    isLoading: false,
    error: null,
  }),
}));

// Imported after the mocks are registered.
import { WidgetForm } from "./WidgetForm";

const TEXT_SCHEMA = {
  type: "object",
  properties: {
    type: { const: "text", default: "text", title: "Type", type: "string" },
    text: { title: "Text", type: "string" },
  },
  required: ["text"],
};

// The shape the widget-schemas endpoint serves for the chart type: the target
// model nested behind $refs, with null-unions on the filter criteria.
const CHART_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { const: "chart", default: "chart", title: "Type", type: "string" },
    target: { $ref: "#/$defs/AttributeTarget" },
    agg: {
      anyOf: [{ enum: ["avg", "min"], type: "string" }, { type: "null" }],
      default: null,
    },
  },
  required: ["target"],
  $defs: {
    AttributeTarget: {
      type: "object",
      additionalProperties: false,
      properties: {
        devices: { $ref: "#/$defs/DevicesFilter" },
        attribute: { minLength: 1, type: "string" },
      },
      required: ["devices", "attribute"],
    },
    DevicesFilter: {
      type: "object",
      additionalProperties: false,
      properties: {
        ids: {
          anyOf: [
            { items: { type: "string" }, type: "array" },
            { type: "null" },
          ],
          default: null,
        },
        types: {
          anyOf: [
            { items: { type: "string" }, type: "array" },
            { type: "null" },
          ],
          default: null,
        },
      },
    },
  },
};

function renderForm(
  type: string,
  configSchema: Record<string, unknown>,
  props: Partial<Parameters<typeof WidgetForm>[0]> = {},
) {
  render(
    <WidgetForm
      type={type}
      configSchema={configSchema}
      formId="f"
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("WidgetForm", () => {
  it("renders schema-derived fields for a type with no registered editor", () => {
    renderForm("text", TEXT_SCHEMA);

    expect(screen.getByLabelText(/Text/)).toBeInTheDocument();
    expect(
      screen.queryByTestId("attribute-target-picker"),
    ).not.toBeInTheDocument();
  });

  // A target is nested objects in the schema, so the default path would render
  // text boxes asking the user to type opaque ids.
  it("uses the registered editor for a type that has one", () => {
    renderForm("chart", CHART_SCHEMA);

    expect(screen.getByTestId("attribute-target-picker")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Target/)).not.toBeInTheDocument();
  });

  it("keeps the shared title field either way", () => {
    renderForm("chart", CHART_SCHEMA);

    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
  });

  // The schema cannot say that an empty device filter — "all devices" on the
  // wire — is never an intentional chart target; the registered check can.
  it("accepts a target with devices and refuses one without", async () => {
    let state: WidgetFormState | undefined;
    const onStateChange = (s: WidgetFormState) => {
      state = s;
    };

    renderForm("chart", CHART_SCHEMA, {
      defaultTitle: "T",
      defaultConfig: {
        type: "chart",
        target: { devices: { ids: ["dev1"] }, attribute: "temperature" },
        agg: null,
      },
      onStateChange,
    });
    await waitFor(() => expect(state?.draft).not.toBeNull());
    cleanup();

    renderForm("chart", CHART_SCHEMA, {
      defaultTitle: "T",
      defaultConfig: {
        type: "chart",
        target: { devices: {}, attribute: "temperature" },
        agg: null,
      },
      onStateChange,
    });
    // The draft must never materialise: give validation the same beat the
    // valid case needed, then require it still reported nothing submittable.
    await expect(
      waitFor(() => expect(state?.draft).not.toBeNull(), { timeout: 250 }),
    ).rejects.toThrow();
    expect(state?.draft).toBeNull();
  });
});
