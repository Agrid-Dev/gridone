import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { createI18nMock } from "@/test/i18nMock";
import type { WizardFormValues } from "./types";
import type { AttributeCoverage, Device } from "@gridone/sdk";
import type { DeviceAttribute } from "@/lib/devices";
import { DeviceType } from "@/lib/devices";

const { mockUseQuery, mockListAttributes } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockListAttributes: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: { listAttributes: mockListAttributes },
  }),
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "commands.attribute": "Attribute",
    "commands.value": "Value",
    "pickers.attribute.placeholder": "Pick attribute",
    "pickers.attribute.coverage": "{{count}}/{{total}} devices",
    "pickers.attribute.mixedTypes": "mixed data types",
    "commands.new.noCompatibleTitle": "No compatible attributes",
    "commands.new.noCompatibleDescription": "No attributes found",
  }),
);

import { CommandStep } from "./CommandStep";

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
  mockListAttributes.mockReset();
});

function attr(
  name: string,
  opts?: {
    dataType?: string;
    valueOptions?: (string | number | boolean)[];
  },
): DeviceAttribute {
  return {
    kind: "standard",
    name,
    data_type: opts?.dataType ?? "str",
    read_write_modes: ["read", "write"],
    current_value: null,
    last_updated: null,
    last_changed: null,
    value_options: opts?.valueOptions,
  };
}

function device(
  id: string,
  type: DeviceType | null = null,
  attributes: DeviceAttribute[] = [],
): Device {
  return {
    id,
    name: `Device ${id}`,
    type,
    driver_id: "drv",
    transport_id: "trp",
    config: {},
    tags: {},
    is_faulty: false,
    attributes: Object.fromEntries(
      attributes.map((a) => [a.name as string, a]),
    ),
  };
}

function coverageRow(
  attribute: string,
  dataType: string,
  writableCount = 1,
): AttributeCoverage {
  return {
    attribute,
    data_types: [dataType] as AttributeCoverage["data_types"],
    device_count: writableCount,
    writable_count: writableCount,
  };
}

function mockCoverage(rows: AttributeCoverage[]) {
  mockUseQuery.mockReturnValue({
    data: { total_devices: rows.length ? 1 : 0, attributes: rows },
    isLoading: false,
    error: null,
  });
}

function Wrapper({
  selectedAttribute,
  selectedDataType,
  selectedDevices,
}: {
  selectedAttribute?: string;
  selectedDataType?: WizardFormValues["attributeDataType"];
  selectedDevices: Device[];
}) {
  const { control, setValue } = useForm<WizardFormValues>({
    defaultValues: { value: selectedAttribute ? "heat" : undefined },
  });
  return (
    <CommandStep
      control={control}
      setValue={setValue}
      filter={{ ids: selectedDevices.map((d) => d.id) }}
      selectedDevices={selectedDevices}
      selectedAttribute={selectedAttribute}
      selectedDataType={selectedDataType}
    />
  );
}

describe("CommandStep value input", () => {
  it("renders a value select when the attribute has valueOptions", () => {
    mockCoverage([coverageRow("mode", "str")]);
    render(
      <Wrapper
        selectedAttribute="mode"
        selectedDataType="str"
        selectedDevices={[
          device("d1", null, [
            attr("mode", { valueOptions: ["heat", "cool", "fan", "auto"] }),
          ]),
        ]}
      />,
    );
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("falls back to text input when valueOptions is an empty array", () => {
    mockCoverage([coverageRow("mode", "str")]);
    render(
      <Wrapper
        selectedAttribute="mode"
        selectedDataType="str"
        selectedDevices={[
          device("d1", null, [attr("mode", { valueOptions: [] })]),
        ]}
      />,
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("renders a text input when the attribute has no valueOptions", () => {
    mockCoverage([coverageRow("name", "str")]);
    render(
      <Wrapper
        selectedAttribute="name"
        selectedDataType="str"
        selectedDevices={[device("d1", null, [attr("name")])]}
      />,
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("renders a number input for int attributes without valueOptions", () => {
    mockCoverage([coverageRow("setpoint", "int")]);
    render(
      <Wrapper
        selectedAttribute="setpoint"
        selectedDataType="int"
        selectedDevices={[
          device("d1", null, [attr("setpoint", { dataType: "int" })]),
        ]}
      />,
    );
    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });

  it("prefers value select over number input when int attribute has valueOptions", () => {
    mockCoverage([coverageRow("level", "int")]);
    render(
      <Wrapper
        selectedAttribute="level"
        selectedDataType="int"
        selectedDevices={[
          device("d1", null, [
            attr("level", { dataType: "int", valueOptions: [1, 2, 3] }),
          ]),
        ]}
      />,
    );
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("renders icons in option items when all devices share a type with a known renderer", () => {
    mockCoverage([coverageRow("mode", "str", 2)]);
    render(
      <Wrapper
        selectedAttribute="mode"
        selectedDataType="str"
        selectedDevices={[
          device("d1", DeviceType.Thermostat, [
            attr("mode", { valueOptions: ["heat", "cool"] }),
          ]),
          device("d2", DeviceType.Thermostat, [
            attr("mode", { valueOptions: ["heat", "cool"] }),
          ]),
        ]}
      />,
    );
    // Badge icons have lucide-* classes; the Select chevron does not match these
    expect(
      document.querySelector(".lucide-sun, .lucide-snowflake"),
    ).toBeTruthy();
  });

  it("renders plain text option items when devices have mixed types with different renderers", () => {
    mockCoverage([coverageRow("mode", "str", 2)]);
    render(
      <Wrapper
        selectedAttribute="mode"
        selectedDataType="str"
        selectedDevices={[
          device("d1", DeviceType.Thermostat, [
            attr("mode", { valueOptions: ["heat"] }),
          ]),
          device("d2", DeviceType.WeatherSensor, [
            attr("mode", { valueOptions: ["heat"] }),
          ]),
        ]}
      />,
    );
    // WeatherSensor has no mode renderer — no badge icon classes
    expect(document.querySelector(".lucide-sun, .lucide-snowflake")).toBeNull();
  });

  it("renders an alert when the target has no writable attribute", () => {
    mockCoverage([]);
    render(<Wrapper selectedDevices={[device("d1")]} />);
    expect(screen.getByText("No compatible attributes")).toBeTruthy();
  });
});
