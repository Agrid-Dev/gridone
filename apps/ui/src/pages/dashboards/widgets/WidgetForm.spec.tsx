import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({ "widgets.fields.title": "Title" }),
);

// The picker fetches devices; stand in for it so this stays a test of which
// editor the form chooses, not of the picker's own behaviour.
vi.mock("@/components/forms/resourcePickers/DeviceAttributePicker", () => ({
  DeviceAttributePicker: () => <div data-testid="device-attribute-picker" />,
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

const CHART_SCHEMA = {
  type: "object",
  properties: {
    type: { const: "chart", default: "chart", title: "Type", type: "string" },
    device_id: { title: "Device Id", type: "string", minLength: 1 },
    attribute: { title: "Attribute", type: "string", minLength: 1 },
  },
  required: ["device_id", "attribute"],
};

function renderForm(type: string, configSchema: Record<string, unknown>) {
  render(
    <WidgetForm
      type={type}
      configSchema={configSchema}
      formId="f"
      onSubmit={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

afterEach(cleanup);

describe("WidgetForm", () => {
  it("renders schema-derived fields for a type with no registered editor", () => {
    renderForm("text", TEXT_SCHEMA);

    expect(screen.getByLabelText(/Text/)).toBeInTheDocument();
    expect(
      screen.queryByTestId("device-attribute-picker"),
    ).not.toBeInTheDocument();
  });

  // A device id is a string in the schema, so the default path would render a
  // text box asking the user to type an opaque id.
  it("uses the registered editor for a type that has one", () => {
    renderForm("chart", CHART_SCHEMA);

    expect(screen.getByTestId("device-attribute-picker")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Device Id/)).not.toBeInTheDocument();
  });

  it("keeps the shared title field either way", () => {
    renderForm("chart", CHART_SCHEMA);

    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
  });
});
