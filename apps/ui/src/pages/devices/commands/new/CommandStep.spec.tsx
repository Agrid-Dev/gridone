import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";
import type { WizardFormValues, WritableAttribute } from "./types";
import { DeviceKind, DeviceType, type Device } from "@/api/devices";

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

function device(id: string, type: DeviceType | null = null): Device {
  return {
    id,
    name: `Device ${id}`,
    type,
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
  selectedDevices,
}: {
  attributes: WritableAttribute[];
  selectedAttribute?: string;
  selectedDataType?: WizardFormValues["attributeDataType"];
  selectedDevices?: Device[];
}) {
  const { control, setValue } = useForm<WizardFormValues>({
    defaultValues: { value: selectedAttribute ? "heat" : undefined },
  });
  return (
    <CommandStep
      control={control}
      setValue={setValue}
      attributes={attributes}
      selectedDevices={selectedDevices ?? [device("d1")]}
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
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("falls back to text input when valueOptions is an empty array", () => {
    const attrs: WritableAttribute[] = [
      { name: "mode", dataType: "str", valueOptions: [] },
    ];
    render(
      <Wrapper
        attributes={attrs}
        selectedAttribute="mode"
        selectedDataType="str"
      />,
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
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

  it("renders icons in option items when all devices share a type with a known renderer", () => {
    const attrs: WritableAttribute[] = [
      {
        name: "mode",
        dataType: "str",
        valueOptions: ["heat", "cool"],
      },
    ];
    render(
      <Wrapper
        attributes={attrs}
        selectedAttribute="mode"
        selectedDataType="str"
        selectedDevices={[
          device("d1", DeviceType.Thermostat),
          device("d2", DeviceType.Thermostat),
        ]}
      />,
    );
    // Badge icons have lucide-* classes; the Select chevron does not match these
    expect(
      document.querySelector(".lucide-sun, .lucide-snowflake"),
    ).toBeTruthy();
  });

  it("renders plain text option items when devices have mixed types with different renderers", () => {
    const attrs: WritableAttribute[] = [
      { name: "mode", dataType: "str", valueOptions: ["heat"] },
    ];
    render(
      <Wrapper
        attributes={attrs}
        selectedAttribute="mode"
        selectedDataType="str"
        selectedDevices={[
          device("d1", DeviceType.Thermostat),
          device("d2", DeviceType.WeatherSensor),
        ]}
      />,
    );
    // WeatherSensor has no mode renderer — no badge icon classes
    expect(document.querySelector(".lucide-sun, .lucide-snowflake")).toBeNull();
  });

  it("renders an alert when no attributes are available", () => {
    render(<Wrapper attributes={[]} />);
    expect(screen.getByText("No compatible attributes")).toBeTruthy();
  });
});
