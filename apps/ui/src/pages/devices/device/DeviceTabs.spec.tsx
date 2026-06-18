import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceKind, type Device } from "@/api/devices";
import { DeviceTabs } from "./DeviceTabs";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.tabs.label": "Device sections",
    "deviceDetails.tabs.overview": "Overview",
    "deviceDetails.tabs.history": "History",
    "deviceDetails.tabs.commands": "Commands",
    "deviceDetails.tabs.config": "Config",
  }),
);

function makeDevice(
  kind: DeviceKind,
  { readWriteModes = ["read", "write"] }: { readWriteModes?: string[] } = {},
): Device {
  const common = {
    id: "d1",
    name: "RTU-3",
    type: null,
    tags: {},
    attributes: {
      value: {
        kind: "standard" as const,
        name: "value",
        dataType: "float",
        readWriteModes,
        currentValue: null,
        lastUpdated: null,
        lastChanged: null,
      },
    },
    isFaulty: false,
  };
  return kind === DeviceKind.Physical
    ? { ...common, kind, driverId: "drv", transportId: "tr", config: {} }
    : { ...common, kind };
}

function renderAt(path: string, device: Device) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DeviceTabs device={device} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("DeviceTabs", () => {
  it("shows Overview, History, Commands and Config for a physical device, with correct routes", () => {
    renderAt("/devices/d1", makeDevice(DeviceKind.Physical));

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/devices/d1",
    );
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
      "href",
      "/devices/d1/history",
    );
    expect(screen.getByRole("link", { name: "Commands" })).toHaveAttribute(
      "href",
      "/devices/d1/commands",
    );
    expect(screen.getByRole("link", { name: "Config" })).toHaveAttribute(
      "href",
      "/devices/d1/edit",
    );
  });

  it("hides Config for a virtual device but keeps Commands", () => {
    renderAt("/devices/d1", makeDevice(DeviceKind.Virtual));

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Commands" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Config" }),
    ).not.toBeInTheDocument();
  });

  it("hides Commands for a read-only device (no writable attributes)", () => {
    renderAt(
      "/devices/d1",
      makeDevice(DeviceKind.Physical, { readWriteModes: ["read"] }),
    );

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "History" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Commands" }),
    ).not.toBeInTheDocument();
  });

  it("marks Overview active only on the index route", () => {
    renderAt("/devices/d1", makeDevice(DeviceKind.Physical));

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "History" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks History active on a history sub-route", () => {
    renderAt("/devices/d1/history/chart", makeDevice(DeviceKind.Physical));

    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
