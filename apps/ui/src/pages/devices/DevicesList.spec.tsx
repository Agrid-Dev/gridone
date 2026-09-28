import { TooltipProvider } from "@/components/ui/tooltip";
import { clearNavigation } from "@/lib/navigation";
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
    "devices.actions.more": "More actions",
    "devices.health.healthy": "No fault",
    "devices.health.faulty": "Faulty",
    "devices.filters.type": "Type",
    "devices.filters.health": "Faults",
    "devices.filters.search": "Filter…",
    "devices.filters.empty": "No results",
    "devices.filters.clear": "Clear selection",
    "devices.filters.reset": "Reset",
    "devices.summary.deviceCount": "{{count}} devices",
    "devices.summary.filteredCount": "{{shown}} of {{count}} devices",
    "devices.summary.ok": "{{count}} connected",
    "devices.summary.degraded": "{{count}} degraded",
    "devices.summary.error": "{{count}} disconnected",
    "devices.summary.idle": "{{count}} idle",
    "deviceDetails.activeFaults.badge": "{{count}} fault(s)",
    "devices.card.lead.setpoint": "setpoint",
    "devices.card.lead.measured": "measured",
    "common.view.label": "View",
    "common:common.severityCount.alert": "{{count}} alert(s)",
    "common:common.severityCount.warning": "{{count}} warning(s)",
    "deviceDetails.connectionStatus.ok": "Connected",
    "deviceDetails.connectionStatus.degraded": "Degraded",
    "deviceDetails.connectionStatus.error": "Disconnected",
    "deviceDetails.connectionStatus.idle": "Idle",
    "commands.subtitle": "Command history",
    "commands.newCommand": "New command",
    "commands.newGroupedCommand": "New grouped command",
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

const floor = {
  id: "a0",
  name: "Floor 2",
  type: "floor",
  path: ["a0"],
} as Asset;
const zone = {
  id: "a1",
  name: "Floor 1",
  type: "room",
  parent_id: "a0",
  path: ["a0", "a1"],
} as Asset;
vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({
    assetTree: [],
    assetsList: [floor, zone],
    assetsById: { a0: floor, a1: zone },
    isLoading: false,
  }),
}));

/** Admins hold every permission; other users hold none of theirs. */
let isAdmin = true;
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => isAdmin,
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
    tags?: Record<string, string[]>;
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
      <TooltipProvider>
        <DevicesList />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

/** The page calls the hook twice: with the list filter (one argument, maybe
 *  undefined) and with no argument for the unfiltered counts. Only the
 *  one-argument calls carry the wiring under test. */
function lastListFilter(): DevicesFilter | undefined {
  const calls = mockUseDevicesList.mock.calls.filter((c) => c.length === 1);
  return calls.at(-1)?.[0] as DevicesFilter | undefined;
}

beforeEach(() => {
  clearNavigation();
  localStorage.removeItem("devices.view");
  isAdmin = true;
  mockUseDevicesList.mockReturnValue({
    devices: [makeDevice("d1", "Alpha")],
    loading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  localStorage.removeItem("devices.view");
  mockUseDevicesList.mockReset();
});

describe("DevicesList — filters", () => {
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

  it("always offers type and fault filters, even for a single-type healthy fleet", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [makeDevice("d1", "T1", { type: "thermostat" })],
      loading: false,
      error: null,
    });
    renderAt();
    expect(lastListFilter()).toBeUndefined();
    expect(screen.getByRole("button", { name: /^Type/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Faults/ })).toBeInTheDocument();
  });

  it("sends every selected type to the server", async () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "T1", { type: "thermostat" }),
        makeDevice("d2", "M1", { type: "electricity_meter" }),
      ],
      loading: false,
      error: null,
    });
    renderAt(["/devices?search=1"]);
    await userEvent.click(screen.getByRole("button", { name: /^Type/ }));
    await userEvent.click(screen.getByRole("option", { name: /Thermostats/ }));
    await userEvent.click(
      screen.getByRole("option", { name: /Electricity meters/ }),
    );
    expect(lastListFilter()).toEqual({
      search: "1",
      types: ["thermostat", "electricity_meter"],
    });
  });

  it("filters on faults, and drops the criterion when both options are picked", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("button", { name: /^Faults/ }));
    await userEvent.click(screen.getByRole("option", { name: /Faulty/ }));
    expect(lastListFilter()).toEqual({ is_faulty: true });
    await userEvent.click(screen.getByRole("option", { name: /No fault/ }));
    expect(lastListFilter()).toBeUndefined();
  });

  it("counts matches against the fleet and resets every filter at once", async () => {
    const fleet = [makeDevice("d1", "Alpha"), makeDevice("d2", "Bravo")];
    mockUseDevicesList.mockImplementation((...args: unknown[]) => ({
      devices: args.length === 0 ? fleet : [fleet[0]],
      loading: false,
      error: null,
    }));
    renderAt(["/devices?search=Alpha&type=thermostat&health=faulty"]);
    expect(screen.getByText("1 of 2 devices")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(lastListFilter()).toBeUndefined();
  });
});

describe("DevicesList — other type bucket", () => {
  beforeEach(() => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "T1", { type: "thermostat" }),
        makeDevice("d3", "M1", { type: "electricity_meter" }),
        makeDevice("d4", "X1", { type: "custom_vendor" }),
      ],
      loading: false,
      error: null,
    });
  });

  it("never sends the other bucket to the server, keeping other criteria", () => {
    renderAt(["/devices?type=other&type=thermostat&health=faulty"]);
    expect(lastListFilter()).toEqual({ is_faulty: true });
  });

  it("narrows client-side to the selected buckets", () => {
    renderAt(["/devices?type=other&type=thermostat"]);
    expect(screen.getByText("X1")).toBeInTheDocument();
    expect(screen.getByText("T1")).toBeInTheDocument();
    expect(screen.queryByText("M1")).not.toBeInTheDocument();
  });
});

describe("DevicesList — header actions", () => {
  it("keeps secondary actions in a menu for writers", async () => {
    renderAt();
    expect(
      screen.queryByRole("link", { name: "Command history" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Command history" }),
    ).toBeInTheDocument();
  });

  it("shows command history as the readers' only action", () => {
    isAdmin = false;
    renderAt();
    expect(
      screen.getByRole("link", { name: "Command history" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "More actions" }),
    ).not.toBeInTheDocument();
  });
});

describe("DevicesList — cards", () => {
  it("shows cards even when the old table view was saved", () => {
    localStorage.setItem("devices.view", "table");
    renderAt();
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      "/devices/d1",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tablist", { name: "View" }),
    ).not.toBeInTheDocument();
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

  it("draws a stopped unit as off, even with a configured mode", () => {
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
    const card = screen
      .getByRole("link", { name: "Chambre 102" })
      .closest(".group") as HTMLElement;
    expect(
      within(card).getByRole("img", { name: "Thermostat" }),
    ).toHaveAttribute("data-state", "stopped");
  });

  it("summarizes a thermostat: location, setpoint, measured reading, mode", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "Ch. 201", {
          type: "thermostat",
          tags: { asset_id: ["a1"] },
          attributes: {
            temperature: attr(21.4),
            temperature_setpoint: attr(21),
            mode: attr("heat"),
            onoff_state: attr(true),
            connection_status: attr("ok"),
          },
        }),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    const link = screen.getByRole("link", { name: /Ch\. 201/ });
    const card = link.closest(".group");
    expect(link).toHaveAttribute("href", "/devices/d1");
    expect(card).toHaveTextContent("Floor 2 · Floor 1");
    expect(card).toHaveTextContent("21,0°");
    expect(card).toHaveTextContent(/21,0°\s*setpoint/);
    expect(card).toHaveTextContent(/21,4°\s*measured/);
    expect(
      within(card as HTMLElement).getByRole("img", { name: "Thermostat" }),
    ).toHaveAttribute("data-state", "running:heat");
  });

  it("shows the highest active severity instead of the healthy label", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "Ch. 411", {
          type: "thermostat",
          attributes: {
            comm_fault: {
              kind: "fault",
              name: "comm_fault",
              severity: "alert",
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
    const card = screen
      .getByRole("link", { name: /Ch\. 411/ })
      .closest(".group");
    expect(card).toHaveTextContent("1 fault(s)");
    expect(card).not.toHaveTextContent("No fault");
  });

  it("groups cards under canonical type headings with counts", () => {
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
    const sections = screen.getAllByRole("region");
    expect(sections).toHaveLength(3);
    expect(screen.getByRole("region", { name: "Thermostats1" })).toBe(
      sections[0],
    );
    expect(screen.getByRole("region", { name: "Electricity meters1" })).toBe(
      sections[1],
    );
    expect(screen.getByRole("region", { name: "Others1" })).toBe(sections[2]);
    expect(within(sections[2]).getByText("X1")).toBeInTheDocument();
    expect(within(sections[0]).getByText("T1")).toBeInTheDocument();
    expect(within(sections[1]).getByText("M1")).toBeInTheDocument();
  });

  it("does not fetch history for cards that never became visible", () => {
    // The global IntersectionObserver stub never reports an intersection, so
    // a card rendered off-screen must not mount its sparkline.
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "Ch. 201", {
          type: "thermostat",
          attributes: { temperature: attr(21.4) },
        }),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    expect(screen.queryByRole("img", { name: "24 h trend" })).toBeNull();
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

  it("hides connection status from non-admin users", () => {
    isAdmin = false;
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "Chambre 101", {
          type: "thermostat",
          attributes: { connection_status: attr("error") },
        }),
      ],
      loading: false,
      error: null,
    });
    renderAt();
    expect(screen.getByText("1 devices")).toBeInTheDocument();
    expect(screen.queryByText("1 disconnected")).not.toBeInTheDocument();
    expect(screen.queryByText("Disconnected")).not.toBeInTheDocument();
  });
});
