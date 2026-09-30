import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, type Control, type FieldValues } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.controlPanel.editor.section": "Section {{index}}",
    "widgets.controlPanel.editor.addSection": "Add section",
    "widgets.controlPanel.editor.title": "Title",
    "widgets.controlPanel.editor.label": "Label",
    "widgets.controlPanel.editor.labelBy": "Label rows by",
    "widgets.controlPanel.editor.labelByOptions.device": "Device name",
    "widgets.controlPanel.editor.labelPlaceholder.attribute":
      "Defaults to the attribute's name",
    "widgets.controlPanel.editor.labelPlaceholder.device":
      "Defaults to the device's name",
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
  BLANK_CONDITION,
  BLANK_SECTION,
  ControlPanelConfigFields,
} from "./ControlPanelConfigFields";

let values: () => { label_by: string; sections: Record<string, unknown>[] };

function Harness({ sections }: { sections: unknown[] }) {
  const form = useForm({
    defaultValues: {
      config: { type: "control_panel", label_by: "attribute", sections },
    },
  });
  values = () =>
    form.getValues().config as {
      label_by: string;
      sections: Record<string, unknown>[];
    };
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

  it("keeps each section's condition its own", () => {
    render(<Harness sections={[BLANK_SECTION, BLANK_SECTION]} />);

    const add = () =>
      fireEvent.click(
        screen.getAllByRole("button", {
          name: "Make active on a condition",
        })[0],
      );
    add();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Selector is on auto" },
    });
    add();

    // The second condition starts blank rather than as a copy of the first…
    expect(values().sections[1].active_when).toEqual(BLANK_CONDITION);
    fireEvent.change(screen.getAllByLabelText("Reason")[1], {
      target: { value: "Other reason" },
    });

    // …and editing it leaves the first one alone.
    expect(values().sections[0].active_when).toMatchObject({
      inactive_reason: "Selector is on auto",
    });
    // Nor does any of it leak into the next form through the shared default.
    expect(BLANK_CONDITION.inactive_reason).toBeNull();
  });

  it("switches what names an unlabelled row, and says so on the label", async () => {
    const user = userEvent.setup();
    render(<Harness sections={[BLANK_SECTION]} />);

    expect(screen.getByLabelText("Label")).toHaveAttribute(
      "placeholder",
      "Defaults to the attribute's name",
    );
    await user.click(screen.getByRole("combobox", { name: "Label rows by" }));
    await user.click(screen.getByRole("option", { name: "Device name" }));

    expect(values().label_by).toBe("device");
    expect(screen.getByLabelText("Label")).toHaveAttribute(
      "placeholder",
      "Defaults to the device's name",
    );
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
