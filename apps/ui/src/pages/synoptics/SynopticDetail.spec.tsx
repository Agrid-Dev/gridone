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
import type { StandardControlProps } from "@/pages/devices/standard-devices/types";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "panel.label": "Selected device",
    "panel.close": "Close panel",
    "common.deviceNotFound": "This device no longer exists.",
    "common.deviceLoadError": "Could not load this device.",
    "faults:faults.unableToLoad": "Unable to load faults",
    "faults.title": "Faults on this view",
    "faults.none": "No active fault on this view",
    "faults.columns.device": "Device",
  }),
);

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
vi.mock("@/hooks/useDeviceDetails", () => ({
  useDeviceDetails: () => ({
    draft: {},
    savingAttr: null,
    feedback: null,
    handleDraftChange: vi.fn(),
    handleSave: vi.fn(),
  }),
}));
vi.mock("@/pages/devices/standard-devices/registry", () => ({
  getStandardDeviceEntry: (type: string | null | undefined) =>
    type === "awhp"
      ? {
          Control: ({ device }: StandardControlProps) => (
            <div data-testid="standard-control">{device.id}</div>
          ),
        }
      : undefined,
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

beforeEach(() => {
  // CTRL-1 is read by B01 but is no symbol's device: its fault is not
  // this view's. Scope is what a symbol is, not what it reads.
  mockUseFaultsList.mockReturnValue({
    faults: [fault("CTRL-1"), fault("PAC-03")],
    loading: false,
    error: null,
  });
  mockUseDeviceById.mockReturnValue({
    data: PAC,
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  mockUseFaultsList.mockReset();
  mockUseDeviceById.mockReset();
});

describe("SynopticDetail", () => {
  it("renders the plate with the faults of its own devices only", async () => {
    renderDetail();
    await screen.findByText("ECS Est");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("PAC-03"),
    ]);
  });

  it("opens the device's standard control beside the plate on click, and closes it", async () => {
    renderDetail();
    await screen.findByText("ECS Est");
    expect(screen.queryByLabelText("Selected device")).toBeNull();

    clickSymbol("pac");

    const panel = screen.getByLabelText("Selected device");
    expect(mockUseDeviceById).toHaveBeenLastCalledWith("PAC-03");
    expect(screen.getByTestId("standard-control").textContent).toBe("PAC-03");
    expect(panel.querySelector("a")?.getAttribute("href")).toBe(
      "/devices/PAC-03",
    );

    await userEvent.click(screen.getByLabelText("Close panel"));
    expect(screen.queryByLabelText("Selected device")).toBeNull();
  });

  it.each([
    [new GridoneError(404, "gone"), "This device no longer exists."],
    [new Error("boom"), "Could not load this device."],
  ])(
    "tells a deleted device from a failed load in the panel",
    async (error, message) => {
      mockUseDeviceById.mockReturnValue({
        data: undefined,
        isLoading: false,
        error,
      });
      renderDetail();
      await screen.findByText("ECS Est");
      clickSymbol("pac");
      const panel = screen.getByLabelText("Selected device");
      expect(panel.textContent).toContain("PAC-03");
      expect(panel.textContent).toContain(message);
    },
  );

  it("shows the faults section loading, then failed, rather than empty", async () => {
    mockUseFaultsList.mockReturnValue({
      faults: [],
      loading: true,
      error: null,
    });
    renderDetail();
    await screen.findByText("ECS Est");
    expect(screen.queryByText("No active fault on this view")).toBeNull();

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
  });

  it("navigates to the plate a link names with no panel open, and marks a link to no plate missing", async () => {
    const client = renderDetail();
    await screen.findByText("ECS Est");
    expect(symbol("to-gone").hasAttribute("data-missing")).toBe(true);
    clickSymbol("pac");
    expect(screen.getByLabelText("Selected device")).toBeInTheDocument();

    clickSymbol("to-west");

    await waitFor(() =>
      expect(client.synoptics.get).toHaveBeenLastCalledWith("west"),
    );
    // The panel showed a device of the plate left behind.
    await waitFor(() =>
      expect(screen.queryByLabelText("Selected device")).toBeNull(),
    );
  });
});
