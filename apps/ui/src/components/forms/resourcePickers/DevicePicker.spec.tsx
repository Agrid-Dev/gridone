import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Device } from "@/api/devices";

const { mockUseQuery, mockListDevices } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockListDevices: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
}));

vi.mock("@/api/devices", () => ({
  listDevices: (...args: unknown[]) => mockListDevices(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "pickers.device.label": "Device",
        "pickers.device.placeholder": "Select a device",
        "pickers.device.noDevices": "No devices available",
      };
      return map[key] ?? key;
    },
  }),
}));

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
    driverId: "drv-1",
    transportId: "tp-1",
    config: {},
    attributes: {},
    isFaulty: false,
  },
  {
    id: "d2",
    name: "Boiler",
    type: null,
    tags: {},
    driverId: "drv-2",
    transportId: "tp-1",
    config: {},
    attributes: {},
    isFaulty: false,
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

  it("renders an option per device and calls onSelect with the matching Device", () => {
    mockUseQuery.mockReturnValue({ data: devices, isLoading: false });
    const onSelect = vi.fn();

    render(<DevicePicker value={undefined} onSelect={onSelect} />);

    const select = screen.getByTestId("select") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Lobby thermostat",
      "Boiler",
    ]);

    fireEvent.change(select, { target: { value: "d2" } });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(devices[1]);
  });
});
