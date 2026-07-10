import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const { mockUseQuery, mockListDevices } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockListDevices: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: { list: mockListDevices },
  }),
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "pickers.device.label": "Device",
    "pickers.device.placeholder": "Select a device",
    "pickers.device.noDevices": "No devices available",
  }),
);

// Stub the shadcn Select with a native <select> so jsdom can drive it without
// Radix's pointer-event quirks. The picker's rendering & callback wiring are
// what we want to verify here, not the Radix integration.
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
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

import { DevicePicker } from "./DevicePicker";

const devices: Device[] = [
  {
    id: "d1",
    name: "Lobby thermostat",
    type: null,
    tags: {},
    driver_id: "drv-1",
    transport_id: "tp-1",
    config: {},
    attributes: {},
    is_faulty: false,
  },
  {
    id: "d2",
    name: "Boiler",
    type: null,
    tags: {},
    driver_id: "drv-2",
    transport_id: "tp-1",
    config: {},
    attributes: {},
    is_faulty: false,
  },
];

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
  mockListDevices.mockReset();
});

describe("DevicePicker", () => {
  it("renders a skeleton while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    const onSelect = vi.fn();

    const { container } = render(
      <DevicePicker value={undefined} onSelect={onSelect} />,
    );

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByTestId("select")).not.toBeInTheDocument();
  });

  it("shows the empty state when no devices are returned", () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });

    render(<DevicePicker value={undefined} onSelect={vi.fn()} />);

    expect(screen.getByText("No devices available")).toBeInTheDocument();
  });

  it("renders an alphabetical option per device and calls onSelect with the matching Device", () => {
    mockUseQuery.mockReturnValue({ data: devices, isLoading: false });
    const onSelect = vi.fn();

    render(<DevicePicker value={undefined} onSelect={onSelect} />);

    const select = screen.getByTestId("select") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Boiler",
      "Lobby thermostat",
    ]);

    fireEvent.change(select, { target: { value: "d2" } });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(devices[1]);
  });
});
