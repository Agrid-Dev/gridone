import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceKind, type Device, type DeviceAttribute } from "@/api/devices";

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

function attr(readWriteModes: string[]): DeviceAttribute {
  return {
    kind: "standard",
    name: "a",
    dataType: "float",
    readWriteModes,
    currentValue: null,
    lastUpdated: null,
    lastChanged: null,
  };
}

function makeDevice(readWriteModes: string[]): Device {
  return {
    id: "d1",
    kind: DeviceKind.Physical,
    name: "d1",
    type: null,
    tags: {},
    driverId: "drv",
    transportId: "tr",
    config: {},
    attributes: { a: attr(readWriteModes) },
    isFaulty: false,
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
