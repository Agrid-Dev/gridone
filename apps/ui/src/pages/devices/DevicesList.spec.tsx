import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Device } from "@/api/devices";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "devices.title": "Devices",
        "devices.subtitle": "Connected fleet",
        "devices.actions.add": "Add",
        "devices.health.label": "Health",
        "devices.health.all": "All",
        "devices.health.healthy": "Healthy",
        "devices.health.faulty": "Faulty",
        "deviceDetails.history": "History",
        "commands.newCommand": "New command",
        "common.type": "Type",
        "common.allTypes": "All types",
        "common:common.device": "Device",
        "common:common.attributes": "attributes",
        "common.severity.alert": "alert",
        "common.severity.warning": "warning",
        "common.severity.info": "info",
      };
      return map[key] ?? key;
    },
  }),
}));

const mockUseDevicesList = vi.fn();
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: (...args: unknown[]) => mockUseDevicesList(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => true,
}));

import DevicesList from "./DevicesList";

function makeDevice(id: string, name: string, isFaulty: boolean): Device {
  return {
    id,
    name,
    type: null,
    tags: {},
    driverId: "drv",
    transportId: "tr",
    config: {},
    attributes: {},
    isFaulty,
  };
}

function renderAt(initialEntries: string[] = ["/devices"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <DevicesList />
    </MemoryRouter>,
  );
}

const devices = [
  makeDevice("d1", "Alpha", false),
  makeDevice("d2", "Bravo", true),
  makeDevice("d3", "Charlie", false),
  makeDevice("d4", "Delta", true),
];

beforeEach(() => {
  mockUseDevicesList.mockReturnValue({
    devices,
    loading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  mockUseDevicesList.mockReset();
});

describe("DevicesList — health filter", () => {
  it("renders all devices with 'All' selected by default", () => {
    renderAt();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText("Delta")).toBeInTheDocument();
  });

  it("shows only healthy devices when ?health=healthy", () => {
    renderAt(["/devices?health=healthy"]);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
    expect(screen.queryByText("Delta")).not.toBeInTheDocument();
  });

  it("shows only faulty devices when ?health=faulty", () => {
    renderAt(["/devices?health=faulty"]);
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("Delta")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  });

  it("switches filter when clicking a tab", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("tab", { name: "Faulty" }));
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("shows empty state when filter yields no matches", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [makeDevice("d1", "Alpha", false)],
      loading: false,
      error: null,
    });
    renderAt(["/devices?health=faulty"]);
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });
});
