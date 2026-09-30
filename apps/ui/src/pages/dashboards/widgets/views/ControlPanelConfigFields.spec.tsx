import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useForm, type Control, type FieldValues } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.controlPanel.editor.section": "Section {{index}}",
    "widgets.controlPanel.editor.addSection": "Add section",
    "widgets.controlPanel.editor.title": "Title",
    "widgets.controlPanel.editor.label": "Label",
    "widgets.controlPanel.editor.addAttribute": "Add attribute",
    "widgets.controlPanel.editor.addCondition": "Make active on a condition",
    "widgets.controlPanel.editor.removeCondition": "Remove condition",
    "widgets.controlPanel.editor.conditionValue": "reads",
    "widgets.controlPanel.editor.inactiveReason": "Reason",
  }),
);

// The picker is its own tested component; a stand-in that picks a fixed pair
// and reports the filter it was given keeps this spec on the editor's wiring.
vi.mock("@/components/forms/resourcePickers/DeviceAttributePicker", () => ({
  default: ({
    deviceId,
    onChange,
    attributeFilter,
  }: {
    deviceId: string | undefined;
    onChange: (next: { deviceId: string; attribute: string }) => void;
    attributeFilter: (attribute: { data_type: string }) => boolean;
  }) => (
    <button
      type="button"
      data-offers-float={attributeFilter({ data_type: "float" })}
      data-offers-bool={attributeFilter({ data_type: "bool" })}
      onClick={() => onChange({ deviceId: "pump1", attribute: "running" })}
    >
      pick attribute ({deviceId ?? "none"})
    </button>
  ),
}));

// Imported after the mocks are registered.
import {
  BLANK_SECTION,
  ControlPanelConfigFields,
} from "./ControlPanelConfigFields";

let values: () => { sections: Record<string, unknown>[] };

function Harness({ sections }: { sections: unknown[] }) {
  const form = useForm({
    defaultValues: { config: { type: "control_panel", sections } },
  });
  values = () =>
    form.getValues().config as { sections: Record<string, unknown>[] };
  return (
    <ControlPanelConfigFields
      control={form.control as unknown as Control<FieldValues>}
    />
  );
}

afterEach(cleanup);

describe("ControlPanelConfigFields", () => {
  it("starts a new widget with one section holding one row to fill", () => {
    // What the generic empty-config builder hands a new widget.
    render(<Harness sections={[]} />);

    expect(values().sections).toEqual([BLANK_SECTION]);
  });

  it("picks boolean attributes freely, row by row and section by section", () => {
    render(<Harness sections={[BLANK_SECTION]} />);

    const picker = screen.getByRole("button", { name: /pick attribute/ });
    expect(picker).toHaveAttribute("data-offers-bool", "true");
    expect(picker).toHaveAttribute("data-offers-float", "false");
    fireEvent.click(picker);
    fireEvent.click(screen.getByRole("button", { name: "Add attribute" }));
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));

    const [first, second] = values().sections;
    expect(first.attributes).toEqual([
      { device_id: "pump1", attribute: "running", label: null },
      { device_id: "", attribute: "", label: null },
    ]);
    expect(second).toEqual(BLANK_SECTION);
  });

  it("adds and removes a section's condition", () => {
    render(<Harness sections={[BLANK_SECTION]} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Make active on a condition" }),
    );
    // The condition's picker comes first, above the row's.
    fireEvent.click(
      screen.getAllByRole("button", { name: /pick attribute/ })[0],
    );
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Selector is on auto" },
    });

    expect(values().sections[0].active_when).toEqual({
      device_id: "pump1",
      attribute: "running",
      value: false,
      inactive_reason: "Selector is on auto",
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove condition" }));

    expect(values().sections[0].active_when).toBeNull();
  });

  it("stores an emptied optional text as null, not as a blank string", () => {
    render(<Harness sections={[BLANK_SECTION]} />);

    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "Pump 1" } });
    expect(values().sections[0].title).toBe("Pump 1");
    fireEvent.change(title, { target: { value: "" } });

    // The schema allows null but refuses "", which would block the save.
    expect(values().sections[0].title).toBeNull();
  });
});
