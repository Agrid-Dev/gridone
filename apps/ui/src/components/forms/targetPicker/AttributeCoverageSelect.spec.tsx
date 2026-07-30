import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { AttributeCoverageResponse } from "@gridone/sdk";
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
    "pickers.attribute.placeholder": "Select an attribute",
    "pickers.attribute.coverage": "{{count}}/{{total}} devices",
    "pickers.attribute.mixedTypes": "mixed data types",
  }),
);

// Stub the shadcn Select with a native <select> so jsdom can drive it without
// Radix's pointer-event quirks.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="select"
      value={value}
      disabled={disabled}
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

import { AttributeCoverageSelect } from "./AttributeCoverageSelect";

const response: AttributeCoverageResponse = {
  total_devices: 12,
  attributes: [
    {
      attribute: "temperature_setpoint",
      data_types: ["float"],
      device_count: 8,
      writable_count: 8,
    },
    {
      attribute: "temperature",
      data_types: ["float"],
      device_count: 12,
      writable_count: 0,
    },
    {
      attribute: "mode",
      data_types: ["str", "int"],
      device_count: 5,
      writable_count: 5,
    },
  ],
};

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
  mockListAttributes.mockReset();
});

describe("AttributeCoverageSelect", () => {
  it("renders the attribute union annotated with device coverage", () => {
    mockUseQuery.mockReturnValue({ data: response, isLoading: false });

    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1", "d2"] }}
        onChange={vi.fn()}
      />,
    );

    const setpoint = screen.getByRole("option", {
      name: /Temperature Setpoint/,
    });
    expect(setpoint.textContent).toContain("8/12 devices");
    // Not an intersection: temperature (read-only) is still offered here.
    expect(
      screen.getByRole("option", { name: /^Temperature\(/ }),
    ).toBeInTheDocument();
  });

  it("disables mixed-data-type rows and shows the reason", () => {
    mockUseQuery.mockReturnValue({ data: response, isLoading: false });

    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1", "d2"] }}
        onChange={vi.fn()}
      />,
    );

    const mixed = screen.getByRole("option", {
      name: /Mode/,
    }) as HTMLOptionElement;
    expect(mixed.disabled).toBe(true);
    expect(mixed.textContent).toContain("mixed data types");
  });

  it("offers only attributes writable somewhere when writableOnly", () => {
    mockUseQuery.mockReturnValue({ data: response, isLoading: false });

    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1", "d2"] }}
        onChange={vi.fn()}
        writableOnly
      />,
    );

    expect(
      screen.getByRole("option", { name: /Temperature Setpoint/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /^Temperature\(/ }),
    ).not.toBeInTheDocument();
  });

  it("emits the attribute with its single data type on change", () => {
    mockUseQuery.mockReturnValue({ data: response, isLoading: false });
    const onChange = vi.fn();

    render(
      <AttributeCoverageSelect
        filter={{ ids: ["d1", "d2"] }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("select"), {
      target: { value: "temperature_setpoint" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("temperature_setpoint", "float");
  });
});
