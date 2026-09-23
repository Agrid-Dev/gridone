import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  GridoneError,
  type Device,
  type FaultView,
  type GridoneClient,
  type Synoptic,
  type SynopticSummary,
} from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { EMPTY_VALUES } from "@/components/synoptic/values";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "popover.label": "Selected device",
    "popover.close": "Close",
    "popover.open": "Open device",
    "common.deviceNotFound": "This device no longer exists.",
    "common.deviceLoadError": "Could not load this device.",
    "faults:faults.unableToLoad": "Unable to load faults",
    "faults.title": "Faults on this view",
    "faults.none": "No active fault on this view",
    "faults.count": "{{count}} faults",
    "faults.columns.device": "Device",
    "common:common.edit": "Edit",
  }),
);

const permissions = { write: false };
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    permission === "synoptics:write" && permissions.write,
}));

vi.mock("@/hooks/useSynopticValues", () => ({
  useSynopticValues: () => EMPTY_VALUES,
}));

const mockUseFaultsList = vi.fn();
vi.mock("@/hooks/useFaultsList", () => ({
  useFaultsList: () => mockUseFaultsList(),
}));
vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({ assetByDeviceId: {} }),
}));

const mockUseDeviceById = vi.fn();
vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: (id: string) => mockUseDeviceById(id),
}));

import SynopticDetail from "./SynopticDetail";

const DOC: Synoptic = {
  id: "ecs",
  name: "ECS Est",
  metadata: {},
  projection: "isometric",
  symbols: [
    {
      id: "pac",
      type: "heat_pump",
      placement: { kind: "cell", cell: { x: 0, y: 0 } },
      label: "PAC 03",
      device_id: "PAC-03",
    },
    {
      id: "pac4",
      type: "heat_pump",
      placement: { kind: "cell", cell: { x: 0, y: 4 } },
      label: "PAC 04",
      device_id: "PAC-04",
    },
    {
      id: "b01",
      type: "tank",
      placement: { kind: "cell", cell: { x: 4, y: 0 } },
      label: "B01",
      bindings: {
        temperature: {
          kind: "attribute",
          target: { devices: { ids: ["CTRL-1"] }, attribute: "t" },
        },
      },
    },
    {
      id: "to-west",
      type: "link",
      placement: { kind: "cell", cell: { x: 8, y: 0 } },
      label: "ECS OUEST",
      props: { synoptic_id: "west" },
    },
    {
      id: "to-gone",
      type: "link",
      placement: { kind: "cell", cell: { x: 8, y: 4 } },
      label: "GONE",
      props: { synoptic_id: "gone" },
    },
  ],
  pipes: [],
  labels: [],
};
const SUMMARIES: SynopticSummary[] = [
  { id: "ecs", name: "ECS Est", projection: "isometric", metadata: {} },
  { id: "west", name: "ECS Ouest", projection: "isometric", metadata: {} },
];
const PAC: Device = {
  id: "PAC-03",
  name: "PAC 03",
  type: "awhp",
  config: {},
  driver_id: "d",
  transport_id: "t",
} as unknown as Device;

const fault = (device_id: string): FaultView => ({
  device_id,
  device_name: device_id,
  attribute_name: "general_fault",
  data_type: "bool",
  severity: "alert",
  current_value: true,
  last_updated: "2026-09-01T00:00:00Z",
  last_changed: "2026-09-01T00:00:00Z",
});

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = {
    synoptics: {
      list: vi.fn(async () => ({ items: SUMMARIES })),
      get: vi.fn(async () => DOC),
    },
  } as unknown as GridoneClient;
  render(
    <GridoneClientProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/synoptics/ecs"]}>
          <Routes>
            <Route path="/synoptics/:synopticId" element={<SynopticDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </GridoneClientProvider>,
  );
  return client;
}

const symbol = (id: string) => document.querySelector(`[data-symbol='${id}']`)!;
/** A plain click on a symbol. The press-to-pan path needs a layout jsdom
 *  has not got and is covered by the canvas's own spec. */
const clickSymbol = (id: string) => fireEvent.click(symbol(id));
const popover = () => screen.queryByLabelText("Selected device");
const faultBadge = () => document.querySelector("[data-fault-count]");

beforeEach(() => {
  // jsdom lays nothing out: the plate cannot place a popover's anchor, and
  // says so with null, as a browser does before layout.
  Object.defineProperty(SVGGElement.prototype, "getScreenCTM", {
    configurable: true,
    value: () => null,
  });
  // CTRL-1 is read by B01 but is no symbol's device: its fault is not
  // this view's. Scope is what a symbol is, not what it reads.
  mockUseFaultsList.mockReturnValue({
    faults: [fault("CTRL-1"), fault("PAC-03")],
    loading: false,
    error: null,
  });
  mockUseDeviceById.mockImplementation((id: string) => ({
    data: { ...PAC, id, name: id },
    isLoading: false,
    error: null,
  }));
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(SVGGElement.prototype, "getScreenCTM");
  permissions.write = false;
  mockUseFaultsList.mockReset();
  mockUseDeviceById.mockReset();
});

describe("SynopticDetail", () => {
  it("renders the plate with the faults of its own devices only, counted in the header", async () => {
    renderDetail();
    await screen.findByText("ECS Est");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("PAC-03"),
    ]);
    expect(faultBadge()?.textContent).toBe("1 faults");
  });

  it("wears no fault badge when the plate's devices have none", async () => {
    mockUseFaultsList.mockReturnValue({
      faults: [fault("CTRL-1")],
      loading: false,
      error: null,
    });
    renderDetail();
    await screen.findByText("ECS Est");
    expect(faultBadge()).toBeNull();
    expect(
      screen.getByText("No active fault on this view"),
    ).toBeInTheDocument();
  });

  it("links to the editor for those who may write, and hides it otherwise", async () => {
    renderDetail();
    await screen.findByText("ECS Est");
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    cleanup();
    permissions.write = true;
    renderDetail();
    await screen.findByText("ECS Est");
    expect(
      screen.getByRole("link", { name: "Edit" }).getAttribute("href"),
    ).toBe("/synoptics/ecs/edit");
  });

  it("opens the device's points over the plate on click, and closes them", async () => {
    renderDetail();
    await screen.findByText("ECS Est");
    expect(popover()).toBeNull();

    clickSymbol("pac");

    const opened = popover()!;
    expect(opened.getAttribute("data-device-popover")).toBe("pac");
    expect(mockUseDeviceById).toHaveBeenLastCalledWith("PAC-03");
    expect(
      screen.getByRole("link", { name: "Open device" }).getAttribute("href"),
    ).toBe("/devices/PAC-03");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(popover()).toBeNull();
  });

  it("shows the points of the last device clicked", async () => {
    renderDetail();
    await screen.findByText("ECS Est");
    clickSymbol("pac");
    expect(popover()!.getAttribute("data-device-popover")).toBe("pac");

    clickSymbol("pac4");

    expect(popover()!.getAttribute("data-device-popover")).toBe("pac4");
    expect(mockUseDeviceById).toHaveBeenLastCalledWith("PAC-04");
  });

  it.each([
    [new GridoneError(404, "gone"), "This device no longer exists."],
    [new Error("boom"), "Could not load this device."],
  ])(
    "tells a deleted device from a failed load in the popover",
    async (error, message) => {
      mockUseDeviceById.mockReturnValue({
        data: undefined,
        isLoading: false,
        error,
      });
      renderDetail();
      await screen.findByText("ECS Est");
      clickSymbol("pac");
      const opened = popover()!;
      expect(opened.textContent).toContain("PAC 03");
      expect(opened.textContent).toContain(message);
    },
  );

  it("shows the faults section loading, then failed, rather than empty, with no badge either way", async () => {
    mockUseFaultsList.mockReturnValue({
      faults: [fault("PAC-03")],
      loading: true,
      error: null,
    });
    renderDetail();
    await screen.findByText("ECS Est");
    expect(screen.queryByText("No active fault on this view")).toBeNull();
    expect(faultBadge()).toBeNull();

    cleanup();
    mockUseFaultsList.mockReturnValue({
      faults: [],
      loading: false,
      error: "x",
    });
    renderDetail();
    await screen.findByText("ECS Est");
    expect(screen.getByText("Unable to load faults")).toBeInTheDocument();
    expect(screen.queryByText("No active fault on this view")).toBeNull();
    expect(faultBadge()).toBeNull();
  });

  it("navigates to the plate a link names with no popover open, and marks a link to no plate missing", async () => {
    const client = renderDetail();
    await screen.findByText("ECS Est");
    expect(symbol("to-gone").hasAttribute("data-missing")).toBe(true);
    clickSymbol("pac");
    expect(popover()).toBeInTheDocument();

    clickSymbol("to-west");

    await waitFor(() =>
      expect(client.synoptics.get).toHaveBeenLastCalledWith("west"),
    );
    // The popover showed a device of the plate left behind.
    await waitFor(() => expect(popover()).toBeNull());
  });
});
