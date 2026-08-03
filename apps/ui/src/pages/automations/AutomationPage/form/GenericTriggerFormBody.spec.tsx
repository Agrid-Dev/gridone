import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "schemaForm.unsupportedField": "Unsupported field",
  }),
);

// Imported after the mocks are registered.
import GenericTriggerFormBody from "./GenericTriggerFormBody";
import changeEventSchema from "@/components/forms/schema-form/__fixtures__/trigger-change-event.json";
import scheduleSchema from "@/components/forms/schema-form/__fixtures__/trigger-schedule.json";

const noop = () => {};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("GenericTriggerFormBody", () => {
  it("renders schema-titled fields (schedule params schema)", () => {
    render(
      <GenericTriggerFormBody
        type="schedule"
        schema={scheduleSchema}
        onSubmit={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByLabelText(/^Cron expression/)).toBeInTheDocument();
  });

  it("shows an explicit placeholder for unsupported shapes instead of skipping them", () => {
    // `condition` is a nested object; the old form silently rendered nothing.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <GenericTriggerFormBody
        type="change_event"
        schema={changeEventSchema}
        onSubmit={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByLabelText(/^Device Id/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Attribute/)).toBeInTheDocument();
    expect(screen.getByText("Condition")).toBeInTheDocument();
    expect(screen.getByText("Unsupported field")).toBeInTheDocument();
  });
});
