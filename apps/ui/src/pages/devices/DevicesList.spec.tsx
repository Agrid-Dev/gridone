import { TooltipProvider } from "@/components/ui/tooltip";
import { clearNavigation } from "@/lib/navigation";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Asset,
  Device,
  DeviceFacets,
  DeviceListParams,
  DevicesPage,
} from "@gridone/sdk";
import { deviceTypeKey } from "@/lib/deviceTypes";
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
    "devices.card.lead.runState.stopped": "Stopped",
    "common.hvacMode.heat": "Heating",
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
    "pagination.label": "Pagination",
    "pagination.previous": "Previous page",
    "pagination.next": "Next page",
    "thermostat.name": "Thermostat",
    "thermostat.name_plural": "Thermostats",
    "electricity_meter.name": "Electricity meter",
    "electricity_meter.name_plural": "Electricity meters",
    "other.name": "Other",
    "other.name_plural": "Others",
  }),
);

const api = vi.hoisted(() => ({
  devices: {
    list: vi.fn<(params: DeviceListParams) => Promise<DevicesPage>>(),
  },
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => api,
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
/** When set, exactly these permissions are held, overriding `isAdmin`. */
let granted: string[] | null = null;
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    granted ? granted.includes(permission) : isAdmin,
}));

import DevicesList from "./DevicesList";

function makeDevice(
  id: string,
  name: string,
  {
    type = null,
    attributes = {},
    tags = {},
    faulty = false,
  }: {
    type?: string | null;
    attributes?: Record<string, unknown>;
    tags?: Record<string, string[]>;
    faulty?: boolean;
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
    is_faulty: faulty,
  } as Device;
}

const attr = (value: unknown) => ({ current_value: value });

/** What the server counts over a match: the fake does the same over the
 *  devices it is given, so chips and summary read real numbers. */
function facetsOf(devices: Device[]): DeviceFacets {
  const facets: DeviceFacets = {
    type: {},
    health: { healthy: 0, faulty: 0 },
    connection_status: { idle: 0, ok: 0, degraded: 0, error: 0 },
  };
  for (const device of devices) {
    const key = deviceTypeKey(device);
    facets.type[key] = (facets.type[key] ?? 0) + 1;
    facets.health[device.is_faulty ? "faulty" : "healthy"] += 1;
    const status = device.attributes?.connection_status?.current_value;
    if (typeof status === "string" && status in facets.connection_status) {
      facets.connection_status[
        status as keyof DeviceFacets["connection_status"]
      ] += 1;
    }
  }
  return facets;
}

function pageOf(
  devices: Device[],
  overrides: Partial<DevicesPage> = {},
): DevicesPage {
  const link = "http://api/devices/?page=1&size=100";
  return {
    items: devices,
    total: devices.length,
    page: 1,
    size: 100,
    total_pages: devices.length ? 1 : 0,
    links: { self: link, first: link, last: link },
    facets: facetsOf(devices),
    ...overrides,
  };
}

/** The fake server: one page for the list (the devices given, as the server
 *  ordered them) and the fleet size for the sidebar's count. */
function serve(
  match: Device[],
  {
    fleetTotal = match.length,
    ...page
  }: Partial<DevicesPage> & {
    fleetTotal?: number;
  } = {},
) {
  api.devices.list.mockImplementation(async (params: DeviceListParams) =>
    params.size === 1
      ? pageOf(match.slice(0, 1), { total: fleetTotal, size: 1 })
      : pageOf(match, page),
  );
}

/** The params of the last page request (the count request asks `size: 1`). */
function lastPageParams(): DeviceListParams | undefined {
  const calls = api.devices.list.mock.calls.filter(
    ([params]) => params.size !== 1,
  );
  return calls.at(-1)?.[0];
}

function renderAt(initialEntries: string[] = ["/devices"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <TooltipProvider>
          <DevicesList />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  clearNavigation();
  localStorage.removeItem("devices.view");
  isAdmin = true;
  granted = null;
  serve([makeDevice("d1", "Alpha")]);
});

afterEach(() => {
  cleanup();
  localStorage.removeItem("devices.view");
  api.devices.list.mockReset();
});

describe("DevicesList — the page", () => {
  it("asks the server for one page of the filters, in type order", async () => {
    renderAt([
      "/devices?search=1&type=thermostat&type=other&health=faulty&page=2",
    ]);

    await waitFor(() =>
      expect(lastPageParams()).toEqual({
        search: "1",
        type: ["thermostat", "other"],
        is_faulty: true,
        page: 2,
        size: 100,
        sort_by: "type",
      }),
    );
  });

  it("renders the page's groups in the server's order, names as served", async () => {
    serve([
      makeDevice("d3", "M1", { type: "electricity_meter" }),
      makeDevice("d2", "chambre 12", { type: "thermostat" }),
      makeDevice("d1", "Atrium", { type: "thermostat" }),
      makeDevice("d4", "X1", { type: "custom_vendor" }),
    ]);
    renderAt();

    await screen.findByText("M1");
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-labelledby"))).toEqual([
      "device-group-electricity_meter",
      "device-group-thermostat",
      "device-group-other",
    ]);
    expect(screen.getByRole("region", { name: "Thermostats2" })).toBe(
      sections[1],
    );
    const names = within(sections[1])
      .getAllByRole("link")
      .map((l) => l.textContent ?? "")
      .filter((n) => ["chambre 12", "Atrium"].includes(n));
    expect(names).toEqual(["chambre 12", "Atrium"]);
    expect(within(sections[2]).getByText("X1")).toBeInTheDocument();
  });

  it("ignores unknown or empty types from the URL", async () => {
    renderAt(["/devices?type=&type=not_a_type"]);

    await screen.findByText("Alpha");
    expect(lastPageParams()).toEqual({ page: 1, size: 100, sort_by: "type" });
    expect(
      screen.queryByRole("button", { name: "Reset" }),
    ).not.toBeInTheDocument();
  });
});

describe("DevicesList — facets", () => {
  it("counts chips, faults and the match from the facets, not the page", async () => {
    serve([makeDevice("d1", "T1", { type: "thermostat" })], {
      total: 3,
      fleetTotal: 10,
      facets: {
        type: { thermostat: 2, other: 1 },
        health: { healthy: 2, faulty: 1 },
        connection_status: { idle: 0, ok: 2, degraded: 0, error: 1 },
      },
    });
    renderAt(["/devices?health=faulty"]);

    expect(await screen.findByText("3 of 10 devices")).toBeInTheDocument();
    const summary = screen.getByText("3 of 10 devices")
      .parentElement as HTMLElement;
    expect(within(summary).getByText("2 connected")).toBeInTheDocument();
    expect(within(summary).getByText("1 disconnected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Type/ }));
    expect(
      screen.getByRole("option", { name: /Thermostats/ }),
    ).toHaveTextContent("2");
    expect(screen.getByRole("option", { name: /Others/ })).toHaveTextContent(
      "1",
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: /^Faults/ }));
    expect(screen.getByRole("option", { name: /Faulty/ })).toHaveTextContent(
      "1",
    );
    expect(screen.getByRole("option", { name: /No fault/ })).toHaveTextContent(
      "2",
    );
  });

  it("sends every selected type to the server, the other bucket included", async () => {
    serve([
      makeDevice("d1", "T1", { type: "thermostat" }),
      makeDevice("d4", "X1", { type: "custom_vendor" }),
    ]);
    renderAt(["/devices?search=1"]);

    await screen.findByText("T1");
    await userEvent.click(screen.getByRole("button", { name: /^Type/ }));
    await userEvent.click(screen.getByRole("option", { name: /Thermostats/ }));
    await userEvent.click(screen.getByRole("option", { name: /Others/ }));
    await waitFor(() =>
      expect(lastPageParams()).toMatchObject({
        search: "1",
        type: ["thermostat", "other"],
      }),
    );
  });

  it("filters on one fault state at a time: a pick replaces the other", async () => {
    renderAt();

    await screen.findByText("Alpha");
    await userEvent.click(screen.getByRole("button", { name: /^Faults/ }));
    await userEvent.click(screen.getByRole("option", { name: /Faulty/ }));
    await waitFor(() =>
      expect(lastPageParams()).toMatchObject({ is_faulty: true }),
    );
    await userEvent.click(screen.getByRole("option", { name: /No fault/ }));
    await waitFor(() =>
      expect(lastPageParams()).toMatchObject({ is_faulty: false }),
    );
    expect(screen.getByRole("option", { name: /No fault/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("option", { name: /Faulty/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("shows the fleet total, not an empty match count, while the page loads", async () => {
    api.devices.list.mockImplementation((params: DeviceListParams) =>
      params.size === 1
        ? Promise.resolve(pageOf([makeDevice("d1", "Alpha")], { total: 2 }))
        : new Promise<DevicesPage>(() => {}),
    );
    renderAt(["/devices?health=faulty"]);

    expect(await screen.findByText("2 devices")).toBeInTheDocument();
    expect(screen.queryByText(/0 of 2/)).not.toBeInTheDocument();
  });

  it("resets every filter and the page at once", async () => {
    serve([makeDevice("d1", "Alpha")], { fleetTotal: 2 });
    renderAt(["/devices?search=Alpha&type=thermostat&health=faulty&page=2"]);

    expect(await screen.findByText("1 of 2 devices")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(lastPageParams()).toEqual({ page: 1, size: 100, sort_by: "type" }),
    );
  });
});

describe("DevicesList — pagination", () => {
  it("links the neighbouring pages from the server's links", async () => {
    serve([makeDevice("d1", "Alpha")], {
      total: 250,
      page: 2,
      total_pages: 3,
      links: {
        self: "http://api/devices/?type=thermostat&page=2&size=100",
        first: "http://api/devices/?type=thermostat&page=1&size=100",
        last: "http://api/devices/?type=thermostat&page=3&size=100",
        prev: "http://api/devices/?type=thermostat&page=1&size=100",
        next: "http://api/devices/?type=thermostat&page=3&size=100",
      },
    });
    renderAt(["/devices?type=thermostat&page=2"]);

    expect(await screen.findByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute(
      "href",
      "/devices?type=thermostat&page=1&size=100",
    );
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/devices?type=thermostat&page=3&size=100",
    );
  });

  it("drops the page when a filter changes: a new match starts on page 1", async () => {
    serve([makeDevice("d1", "T1", { type: "thermostat" })], {
      page: 2,
      total_pages: 2,
    });
    renderAt(["/devices?page=2"]);

    await screen.findByText("T1");
    await userEvent.click(screen.getByRole("button", { name: /^Type/ }));
    await userEvent.click(screen.getByRole("option", { name: /Thermostats/ }));
    await waitFor(() =>
      expect(lastPageParams()).toMatchObject({ type: ["thermostat"], page: 1 }),
    );
  });

  it("shows no pager when everything fits on one page", async () => {
    renderAt();

    await screen.findByText("Alpha");
    expect(
      screen.queryByRole("navigation", { name: "Pagination" }),
    ).not.toBeInTheDocument();
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

  it.each([
    {
      permissions: ["devices:read"],
      shown: ["Command history"],
      hidden: ["Add", "New grouped command"],
    },
    {
      permissions: ["devices:read", "devices:command"],
      shown: ["Command history", "New grouped command"],
      hidden: ["Add"],
    },
    {
      permissions: ["devices:read", "devices:write"],
      shown: ["Add"],
      hidden: ["New grouped command"],
    },
  ])(
    "gates each action on its own permission: $permissions",
    ({ permissions, shown, hidden }) => {
      granted = permissions;
      renderAt();
      for (const name of shown)
        expect(screen.getByRole("link", { name })).toBeInTheDocument();
      for (const name of hidden)
        expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    },
  );
});

describe("DevicesList — cards", () => {
  it("shows cards even when the old table view was saved", async () => {
    localStorage.setItem("devices.view", "table");
    renderAt();
    expect(await screen.findByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      "/devices/d1",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tablist", { name: "View" }),
    ).not.toBeInTheDocument();
  });

  it("shows a stopped unit as idle, even with a configured mode", async () => {
    serve([
      makeDevice("d1", "Chambre 102", {
        type: "thermostat",
        attributes: { onoff_state: attr(false), mode: attr("heat") },
      }),
    ]);
    renderAt();
    const card = (
      await screen.findByRole("link", { name: "Chambre 102" })
    ).closest(".group") as HTMLElement;
    expect(card.querySelector("[data-activity]")).toHaveAttribute(
      "data-activity",
      "idle",
    );
    expect(card).toHaveTextContent("Stopped");
    expect(card).not.toHaveTextContent("Heating");
  });

  it("summarizes a thermostat: location, setpoint, measured reading, mode", async () => {
    serve([
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
    ]);
    renderAt();
    const link = await screen.findByRole("link", { name: /Ch\. 201/ });
    const card = link.closest(".group");
    expect(link).toHaveAttribute("href", "/devices/d1");
    expect(card).toHaveTextContent("Floor 2 · Floor 1");
    expect(card).toHaveTextContent("21,0°");
    expect(card).toHaveTextContent(/21,0°\s*setpoint/);
    expect(card).toHaveTextContent(/21,4°\s*measured/);
    expect(card?.querySelector("[data-activity]")).toHaveAttribute(
      "data-activity",
      "running",
    );
    expect(card).toHaveTextContent("Heating");
  });

  it("shows the highest active severity instead of the healthy label", async () => {
    serve([
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
    ]);
    renderAt();
    const card = (
      await screen.findByRole("link", { name: /Ch\. 411/ })
    ).closest(".group");
    expect(card).toHaveTextContent("1 fault(s)");
    expect(card).not.toHaveTextContent("No fault");
  });

  it("does not fetch history for cards that never became visible", async () => {
    // The global IntersectionObserver stub never reports an intersection, so
    // a card rendered off-screen must not mount its sparkline.
    serve([
      makeDevice("d1", "Ch. 201", {
        type: "thermostat",
        attributes: { temperature: attr(21.4) },
      }),
    ]);
    renderAt();
    await screen.findByRole("link", { name: /Ch\. 201/ });
    expect(screen.queryByRole("img", { name: "24 h trend" })).toBeNull();
  });
});

describe("DevicesList — summary", () => {
  it("shows the fleet total and non-zero connection buckets", async () => {
    serve([
      makeDevice("d1", "A", { attributes: { connection_status: attr("ok") } }),
      makeDevice("d2", "B", { attributes: { connection_status: attr("ok") } }),
      makeDevice("d3", "C", {
        attributes: { connection_status: attr("degraded") },
      }),
      makeDevice("d4", "D", {
        attributes: { connection_status: attr("error") },
      }),
    ]);
    renderAt();
    // The fleet line, not the group's: its disconnected count says it too.
    const summary = (await screen.findByText("4 devices"))
      .parentElement as HTMLElement;
    expect(within(summary).getByText("2 connected")).toBeInTheDocument();
    expect(within(summary).getByText("1 degraded")).toBeInTheDocument();
    expect(within(summary).getByText("1 disconnected")).toBeInTheDocument();
    expect(screen.queryByText(/idle/)).not.toBeInTheDocument();
  });

  it("hides connection status from non-admin users", async () => {
    isAdmin = false;
    serve([
      makeDevice("d1", "Chambre 101", {
        type: "thermostat",
        attributes: { connection_status: attr("error") },
      }),
    ]);
    renderAt();
    expect(await screen.findByText("1 devices")).toBeInTheDocument();
    expect(screen.queryByText("1 disconnected")).not.toBeInTheDocument();
    expect(screen.queryByText("Disconnected")).not.toBeInTheDocument();
  });
});
