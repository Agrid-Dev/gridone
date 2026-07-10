import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import type { Device } from "@gridone/sdk";
import type { AttributeFields } from "@/lib/faults";

vi.mock("react-i18next", () =>
  createI18nMock({
    "commands.readOnlyTitle": "Read-only device",
    "commands.readOnlyDescription": "No writable attributes, so no commands.",
  }),
);

let currentDevice: Device;
vi.mock("@/hooks/useDevice", () => ({
  useDeviceFromRoute: () => currentDevice,
}));
vi.mock("@/components/BreadcrumbProvider", () => ({ useBreadcrumb: vi.fn() }));
vi.mock("@/pages/devices/commands/CommandsPage", () => ({
  default: ({ deviceId }: { deviceId?: string }) => (
    <div data-testid="commands-page">commands:{deviceId}</div>
  ),
}));

import DeviceCommandsPage from "./DeviceCommandsPage";

function attr(readWriteModes: string[]): AttributeFields {
  return {
    kind: "standard",
    name: "a",
    data_type: "float",
    read_write_modes: readWriteModes,
    current_value: null,
    last_updated: null,
    last_changed: null,
  };
}

function makeDevice(readWriteModes: string[]): Device {
  return {
    id: "d1",
    name: "d1",
    type: null,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes: { a: attr(readWriteModes) },
    is_faulty: false,
  };
}

afterEach(cleanup);

describe("DeviceCommandsPage", () => {
  it("shows a read-only empty state when no attribute is writable", () => {
    currentDevice = makeDevice(["read"]);
    render(<DeviceCommandsPage />);

    expect(screen.getByText("Read-only device")).toBeInTheDocument();
    expect(screen.queryByTestId("commands-page")).not.toBeInTheDocument();
  });

  it("renders the commands list for a controllable device", () => {
    currentDevice = makeDevice(["read", "write"]);
    render(<DeviceCommandsPage />);

    expect(screen.getByTestId("commands-page")).toHaveTextContent(
      "commands:d1",
    );
    expect(screen.queryByText("Read-only device")).not.toBeInTheDocument();
  });
});
