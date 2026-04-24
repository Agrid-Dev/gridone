import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Device, DevicesFilter } from "@/api/devices";

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

/** Extract the last filter `useDevicesList` was called with. */
function lastFilter(): DevicesFilter | undefined {
  const calls = mockUseDevicesList.mock.calls;
  return calls.at(-1)?.[0] as DevicesFilter | undefined;
}

beforeEach(() => {
  mockUseDevicesList.mockReturnValue({
    devices: [makeDevice("d1", "Alpha", false)],
    loading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  mockUseDevicesList.mockReset();
});

describe("DevicesList — health filter wiring", () => {
  it("renders whatever useDevicesList returns", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "Alpha", false),
        makeDevice("d2", "Bravo", true),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });

  it("calls useDevicesList with undefined when no filters are set", () => {
    renderAt();
    expect(lastFilter()).toBeUndefined();
  });

  it("passes isFaulty=true when ?health=faulty", () => {
    renderAt(["/devices?health=faulty"]);
    expect(lastFilter()).toEqual({ isFaulty: true });
  });

  it("passes isFaulty=false when ?health=healthy", () => {
    renderAt(["/devices?health=healthy"]);
    expect(lastFilter()).toEqual({ isFaulty: false });
  });

  it("combines type and health filters", () => {
    renderAt(["/devices?type=thermostat&health=faulty"]);
    expect(lastFilter()).toEqual({
      types: ["thermostat"],
      isFaulty: true,
    });
  });

  it("updates the filter when a health tab is clicked", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("tab", { name: "Faulty" }));
    expect(lastFilter()).toEqual({ isFaulty: true });
  });

  it("clears the filter when returning to 'All'", async () => {
    renderAt(["/devices?health=faulty"]);
    await userEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(lastFilter()).toBeUndefined();
  });
});
