import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { AttributeCoverageResponse, Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

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
    "commands.new.targetMode.devices": "Specific devices",
    "commands.new.targetMode.filters": "By filter",
    "commands.new.summary.deviceCount": "{{count}} devices",
    "commands.new.filterPreviewHint": "Re-resolved at each dispatch.",
    "commands.new.noDevicesMatch": "No devices match your filter.",
    "commands.new.selectionCount": "{{count}} of {{total}} selected",
    "commands.new.searchDevicesPlaceholder": "Search devices",
    "common:common.clear": "Clear",
    "pickers.attribute.placeholder": "Select an attribute",
    "pickers.attribute.coverage": "{{count}}/{{total}} devices",
    "pickers.attribute.mixedTypes": "mixed data types",
    "pickers.attribute.skippedWarning":
      "{{count}} of {{total}} matched devices don't expose this attribute and will be skipped.",
  }),
);

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="attribute-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    disabled,
    children,
  }: {
    value: string;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  ),
}));

import { AttributeTargetPicker } from "./AttributeTargetPicker";

function device(id: string, tags: Record<string, string> = {}): Device {
  return { id, name: id, tags } as Device;
}

const devices: Device[] = [
  device("d1", { floor: "1" }),
  device("d2", { floor: "1" }),
];

const coverageResponse: AttributeCoverageResponse = {
  total_devices: 10,
  attributes: [
    {
      attribute: "temperature",
      data_types: ["float"],
      device_count: 7,
      writable_count: 0,
    },
  ],
};

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
  mockListAttributes.mockReset();
});

describe("AttributeTargetPicker — filter-mode missing-attribute warning", () => {
  it("warns with the skipped count when some matched devices lack the attribute", () => {
    mockUseQuery.mockReturnValue({ data: coverageResponse, isLoading: false });

    render(
      <AttributeTargetPicker
        value={{ devices: { types: ["thermostat"] }, attribute: "temperature" }}
        onChange={vi.fn()}
        devices={devices}
      />,
    );

    expect(
      screen.getByText(
        "3 of 10 matched devices don't expose this attribute and will be skipped.",
      ),
    ).toBeInTheDocument();
  });

  it("shows no warning once every matched device exposes the attribute", () => {
    mockUseQuery.mockReturnValue({
      data: {
        total_devices: 7,
        attributes: [
          {
            attribute: "temperature",
            data_types: ["float"],
            device_count: 7,
            writable_count: 0,
          },
        ],
      },
      isLoading: false,
    });

    render(
      <AttributeTargetPicker
        value={{ devices: { types: ["thermostat"] }, attribute: "temperature" }}
        onChange={vi.fn()}
        devices={devices}
      />,
    );

    expect(
      screen.queryByText(/matched devices don't expose this attribute/),
    ).not.toBeInTheDocument();
  });

  it("round-trips a tag criterion added via the filters tab", () => {
    mockUseQuery.mockReturnValue({ data: coverageResponse, isLoading: false });
    const onChange = vi.fn();

    render(
      <AttributeTargetPicker
        value={{ devices: { types: ["thermostat"] } }}
        onChange={onChange}
        devices={devices}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1" }));

    expect(onChange).toHaveBeenCalledWith({
      devices: { types: ["thermostat"], tags: { floor: ["1"] } },
      attribute: undefined,
    });
  });
});
