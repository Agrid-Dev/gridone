import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Asset, Device } from "@gridone/sdk";
import type { DevicesFilter } from "@/lib/devices";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "devices.title": "Devices",
    "devices.actions.add": "Add",
    "devices.health.label": "Health",
    "devices.health.all": "All",
    "devices.health.healthy": "Healthy",
    "devices.health.faulty": "Faulty",
    "devices.filters.label": "Filter by type",
    "devices.filters.all": "All types",
    "devices.summary.deviceCount": "{{count}} devices",
    "devices.summary.ok": "{{count}} connected",
    "devices.summary.degraded": "{{count}} degraded",
    "devices.summary.error": "{{count}} disconnected",
    "devices.summary.idle": "{{count}} idle",
    "devices.table.device": "Device",
    "devices.table.zone": "Zone",
    "devices.table.measure": "Measure",
    "devices.table.setpoint": "Setpoint",
    "devices.table.mode": "Mode",
    "devices.table.connection": "Connection",
    "devices.table.faults": "Faults",
    "deviceDetails.connectionStatus.ok": "Connected",
    "deviceDetails.connectionStatus.degraded": "Degraded",
    "deviceDetails.connectionStatus.error": "Disconnected",
    "deviceDetails.connectionStatus.idle": "Idle",
    "commands.subtitle": "Command history",
    "commands.newCommand": "New command",
    "common.hvacMode.heat": "Heating",
    "common.hvacMode.off": "Off",
    "common.severityCount.alert": "{{count}} alert(s)",
    "common.severityCount.warning": "{{count}} warning(s)",
    "common:common.device": "Device",
    "thermostat.name": "Thermostat",
    "thermostat.name_plural": "Thermostats",
    "electricity_meter.name": "Electricity meter",
    "electricity_meter.name_plural": "Electricity meters",
    "other.name": "Other",
    "other.name_plural": "Others",
  }),
);

const mockUseDevicesList = vi.fn();
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: (...args: unknown[]) => mockUseDevicesList(...args),
}));

const zone = { id: "a1", name: "Floor 1", type: "floor" } as Asset;
vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({
    assetTree: [],
    assetsList: [zone],
    assetsById: { a1: zone },
    isLoading: false,
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => true,
}));

import DevicesList from "./DevicesList";

function makeDevice(
  id: string,
  name: string,
  {
    type = null,
    attributes = {},
    tags = {},
  }: {
    type?: string | null;
    attributes?: Record<string, unknown>;
    tags?: Record<string, string>;
  } = {},
): Device {
  return {
    id,
    name,
    type,
    tags,
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes,
    is_faulty: false,
  } as Device;
}

const attr = (value: unknown) => ({ current_value: value });

function renderAt(initialEntries: string[] = ["/devices"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <DevicesList />
    </MemoryRouter>,
  );
}

/** The page calls the hook twice: with the table filter (one argument, maybe
 *  undefined) and with no argument for the unfiltered counts. Only the
 *  one-argument calls carry the wiring under test. */
function lastTableFilter(): DevicesFilter | undefined {
  const calls = mockUseDevicesList.mock.calls.filter((c) => c.length === 1);
  return calls.at(-1)?.[0] as DevicesFilter | undefined;
}

beforeEach(() => {
  mockUseDevicesList.mockReturnValue({
    devices: [makeDevice("d1", "Alpha")],
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
      devices: [makeDevice("d1", "Alpha"), makeDevice("d2", "Bravo")],
      loading: false,
      error: null,
    });
    renderAt();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });

  it("calls useDevicesList with undefined when no filters are set", () => {
    renderAt();
    expect(lastTableFilter()).toBeUndefined();
  });

  it("passes isFaulty=true when ?health=faulty", () => {
    renderAt(["/devices?health=faulty"]);
    expect(lastTableFilter()).toEqual({ is_faulty: true });
  });

  it("passes isFaulty=false when ?health=healthy", () => {
    renderAt(["/devices?health=healthy"]);
    expect(lastTableFilter()).toEqual({ is_faulty: false });
  });

  it("combines type and health filters", () => {
    renderAt(["/devices?type=thermostat&health=faulty"]);
    expect(lastTableFilter()).toEqual({
      types: ["thermostat"],
      is_faulty: true,
    });
  });

  it("updates the filter when a health tab is clicked", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("tab", { name: "Faulty" }));
    expect(lastTableFilter()).toEqual({ is_faulty: true });
  });

  it("clears the filter when returning to 'All'", async () => {
    renderAt(["/devices?health=faulty"]);
    await userEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(lastTableFilter()).toBeUndefined();
  });

  it("still honors ?search deep links server-side", () => {
    renderAt(["/devices?search=chambre%2012"]);
    expect(lastTableFilter()).toEqual({ search: "chambre 12" });
  });
});

describe("DevicesList — type chips", () => {
  beforeEach(() => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "T1", { type: "thermostat" }),
        makeDevice("d2", "T2", { type: "thermostat" }),
        makeDevice("d3", "M1", { type: "electricity_meter" }),
        makeDevice("d4", "X1", { type: "custom_vendor" }),
      ],
      loading: false,
      error: null,
    });
  });

  it("renders a chip per type present, with counts and other last", () => {
    renderAt();
    const chips = within(
      screen.getByRole("group", { name: "Filter by type" }),
    ).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual([
      "All types4",
      "Thermostats2",
      "Electricity meters1",
      "Others1",
    ]);
  });

  it("sets ?type when a chip is clicked", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("button", { name: /Thermostats/ }));
    expect(lastTableFilter()).toEqual({ types: ["thermostat"] });
  });

  it("clears ?type via the All chip", async () => {
    renderAt(["/devices?type=thermostat"]);
    await userEvent.click(screen.getByRole("button", { name: /All types/ }));
    expect(lastTableFilter()).toBeUndefined();
  });

  it("never sends the other bucket to the server", () => {
    renderAt(["/devices?type=other"]);
    expect(lastTableFilter()).toBeUndefined();
  });

  it("keeps the health criterion server-side when filtering on other", () => {
    renderAt(["/devices?type=other&health=faulty"]);
    expect(lastTableFilter()).toEqual({ is_faulty: true });
  });

  it("shows only unknown-type devices when ?type=other", () => {
    renderAt(["/devices?type=other"]);
    expect(screen.getByText("X1")).toBeInTheDocument();
    expect(screen.queryByText("T1")).not.toBeInTheDocument();
    expect(screen.queryByText("M1")).not.toBeInTheDocument();
  });
});

describe("DevicesList — table", () => {
  it("groups devices under canonical type headers with counts", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d3", "M1", { type: "electricity_meter" }),
        makeDevice("d1", "T1", { type: "thermostat" }),
        makeDevice("d4", "X1", { type: "custom_vendor" }),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    const rows = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    const headerIndex = (label: string) =>
      rows.findIndex((text) => text.includes(label));
    expect(headerIndex("Thermostats")).toBeGreaterThan(-1);
    expect(headerIndex("Thermostats")).toBeLessThan(
      headerIndex("Electricity meters"),
    );
    expect(headerIndex("Electricity meters")).toBeLessThan(
      headerIndex("Others"),
    );
  });

  it("sorts devices by name within a group", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "chambre 12", { type: "thermostat" }),
        makeDevice("d2", "Atrium", { type: "thermostat" }),
        makeDevice("d3", "bureau", { type: "thermostat" }),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    const deviceNames = new Set(["chambre 12", "Atrium", "bureau"]);
    const names = screen
      .getAllByRole("link")
      .map((l) => l.textContent ?? "")
      .filter((n) => deviceNames.has(n));
    expect(names).toEqual(["Atrium", "bureau", "chambre 12"]);
  });

  it("links each device name to its detail page", () => {
    renderAt();
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      "/devices/d1",
    );
  });

  it("renders the full state of a thermostat row", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "Chambre 101", {
          type: "thermostat",
          tags: { asset_id: "a1" },
          attributes: {
            temperature: attr(20.5),
            temperature_setpoint: attr(21),
            onoff_state: attr(true),
            mode: attr("heat"),
            connection_status: attr("ok"),
          },
        }),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    const row = screen.getByRole("link", { name: "Chambre 101" }).closest("tr");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("Floor 1");
    expect(row).toHaveTextContent("20.5°");
    expect(row).toHaveTextContent("21.0°");
    expect(row).toHaveTextContent("Heating");
    expect(row).toHaveTextContent("Connected");
  });

  it("shows Off when the unit is stopped, even with a configured mode", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "Chambre 102", {
          type: "thermostat",
          attributes: { onoff_state: attr(false), mode: attr("heat") },
        }),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    const row = screen.getByRole("link", { name: "Chambre 102" }).closest("tr");
    expect(row).toHaveTextContent("Off");
    expect(row).not.toHaveTextContent("Heating");
  });

  it("summarizes active faults at the highest severity", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "CTA Restaurant", {
          type: "thermostat",
          attributes: {
            filter_fault: {
              kind: "fault",
              name: "filter_fault",
              severity: "alert",
              is_faulty: true,
              current_value: true,
            },
            minor_fault: {
              kind: "fault",
              name: "minor_fault",
              severity: "warning",
              is_faulty: true,
              current_value: true,
            },
          },
        }),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    const row = screen
      .getByRole("link", { name: "CTA Restaurant" })
      .closest("tr");
    expect(row).toHaveTextContent("1 alert(s)");
  });

  it("dashes out unavailable cells", () => {
    renderAt();
    const row = screen.getByRole("link", { name: "Alpha" }).closest("tr");
    // Zone, measure, setpoint, mode, connection, faults are all unknown.
    expect(row?.textContent).toContain("—");
  });
});

describe("DevicesList — summary", () => {
  it("shows the fleet total and non-zero connection buckets", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "A", {
          attributes: { connection_status: attr("ok") },
        }),
        makeDevice("d2", "B", {
          attributes: { connection_status: attr("ok") },
        }),
        makeDevice("d3", "C", {
          attributes: { connection_status: attr("degraded") },
        }),
        makeDevice("d4", "D", {
          attributes: { connection_status: attr("error") },
        }),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    expect(screen.getByText("4 devices")).toBeInTheDocument();
    expect(screen.getByText("2 connected")).toBeInTheDocument();
    expect(screen.getByText("1 degraded")).toBeInTheDocument();
    expect(screen.getByText("1 disconnected")).toBeInTheDocument();
    expect(screen.queryByText(/idle/)).not.toBeInTheDocument();
  });
});
