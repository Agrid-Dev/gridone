import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";
import type { WizardFormValues, WritableAttribute } from "./types";
import { DeviceKind, type Device } from "@/api/devices";

vi.mock("react-i18next", () =>
  createI18nMock({
    "commands.attribute": "Attribute",
    "commands.value": "Value",
    "commands.new.pickAttributePlaceholder": "Pick attribute",
    "commands.new.noCompatibleTitle": "No compatible attributes",
    "commands.new.noCompatibleDescription": "No attributes found",
  }),
);

import { CommandStep } from "./CommandStep";

afterEach(() => cleanup());

function device(id: string): Device {
  return {
    id,
    name: `Device ${id}`,
    type: null,
    kind: DeviceKind.Physical,
    driverId: "drv",
    transportId: "trp",
    config: {},
    tags: {},
    isFaulty: false,
    attributes: {},
  };
}

function Wrapper({
  attributes,
  selectedAttribute,
  selectedDataType,
}: {
  attributes: WritableAttribute[];
  selectedAttribute?: string;
  selectedDataType?: WizardFormValues["attributeDataType"];
}) {
  const { control, setValue } = useForm<WizardFormValues>({
    defaultValues: { value: selectedAttribute ? "heat" : undefined },
  });
  return (
    <CommandStep
      control={control}
      setValue={setValue}
      attributes={attributes}
      selectedDevices={[device("d1")]}
      selectedAttribute={selectedAttribute}
      selectedDataType={selectedDataType}
    />
  );
}

describe("CommandStep value input", () => {
  it("renders a value select when the attribute has valueOptions", () => {
    const attrs: WritableAttribute[] = [
      {
        name: "mode",
        dataType: "str",
        valueOptions: ["heat", "cool", "fan", "auto"],
      },
    ];
    render(
      <Wrapper
        attributes={attrs}
        selectedAttribute="mode"
        selectedDataType="str"
      />,
    );
    // Two comboboxes: attribute picker + value picker
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("renders a text input when the attribute has no valueOptions", () => {
    const attrs: WritableAttribute[] = [{ name: "name", dataType: "str" }];
    render(
      <Wrapper
        attributes={attrs}
        selectedAttribute="name"
        selectedDataType="str"
      />,
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
    // Only the attribute picker combobox; no value select
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("renders a number input for int attributes without valueOptions", () => {
    const attrs: WritableAttribute[] = [{ name: "setpoint", dataType: "int" }];
    render(
      <Wrapper
        attributes={attrs}
        selectedAttribute="setpoint"
        selectedDataType="int"
      />,
    );
    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });

  it("prefers value select over number input when int attribute has valueOptions", () => {
    const attrs: WritableAttribute[] = [
      { name: "level", dataType: "int", valueOptions: [1, 2, 3] },
    ];
    render(
      <Wrapper
        attributes={attrs}
        selectedAttribute="level"
        selectedDataType="int"
      />,
    );
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("renders an alert when no attributes are available", () => {
    render(<Wrapper attributes={[]} />);
    expect(screen.getByText("No compatible attributes")).toBeTruthy();
  });
});
