import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Device } from "@gridone/sdk";
import type { DevicesFilter } from "@/lib/devices";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "devices.title": "Devices",
    "devices.subtitle": "Connected fleet",
    "devices.actions.add": "Add",
    "devices.health.label": "Health",
    "devices.health.all": "All",
    "devices.health.healthy": "Healthy",
    "devices.health.faulty": "Faulty",
    "devices.search.label": "Search devices",
    "devices.search.placeholder": "Search devices…",
    "devices.search.clear": "Clear search",
    "deviceDetails.history": "History",
    "commands.newCommand": "New command",
    "common.type": "Type",
    "common.allTypes": "All types",
    "common:common.device": "Device",
    "common:common.attributes": "attributes",
    "common.severity.alert": "alert",
    "common.severity.warning": "warning",
    "common.severity.info": "info",
  }),
);

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
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes: {},
    is_faulty: isFaulty,
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
    expect(lastFilter()).toEqual({ is_faulty: true });
  });

  it("passes isFaulty=false when ?health=healthy", () => {
    renderAt(["/devices?health=healthy"]);
    expect(lastFilter()).toEqual({ is_faulty: false });
  });

  it("combines type and health filters", () => {
    renderAt(["/devices?type=thermostat&health=faulty"]);
    expect(lastFilter()).toEqual({
      types: ["thermostat"],
      is_faulty: true,
    });
  });

  it("updates the filter when a health tab is clicked", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("tab", { name: "Faulty" }));
    expect(lastFilter()).toEqual({ is_faulty: true });
  });

  it("clears the filter when returning to 'All'", async () => {
    renderAt(["/devices?health=faulty"]);
    await userEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(lastFilter()).toBeUndefined();
  });
});

describe("DevicesList — search filter wiring", () => {
  it("passes search to useDevicesList when ?search is set", () => {
    renderAt(["/devices?search=chambre%2012"]);
    expect(lastFilter()).toEqual({ search: "chambre 12" });
  });

  it("debounces typing into the search bar then updates the filter", () => {
    vi.useFakeTimers();
    try {
      renderAt();
      const input = screen.getByLabelText("Search devices");

      act(() => {
        fireEvent.change(input, { target: { value: "chambre" } });
      });
      expect(lastFilter()).toBeUndefined();

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(lastFilter()).toEqual({ search: "chambre" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the search via the inline clear button", () => {
    renderAt(["/devices?search=chambre"]);
    expect(lastFilter()).toEqual({ search: "chambre" });

    act(() => {
      fireEvent.click(screen.getByLabelText("Clear search"));
    });
    expect(lastFilter()).toBeUndefined();
  });
});

describe("DevicesList — ordering", () => {
  it("renders devices alphabetically by name regardless of API order", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "chambre 12", false),
        makeDevice("d2", "Atrium", false),
        makeDevice("d3", "bureau", false),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    // Drop the page title heading; only the device cards remain.
    const names = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent)
      .filter((n) => n !== "Devices");
    expect(names).toEqual(["Atrium", "bureau", "chambre 12"]);
  });
});
