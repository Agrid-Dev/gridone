import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { Asset, Device, FaultView } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "topbar.search.label": "Global search",
    "topbar.search.placeholder": "Search a device, a zone, a fault…",
    "topbar.search.description": "Search and open a device, a zone or a fault.",
    "topbar.search.empty": "No results",
    "topbar.search.loading": "Loading…",
    "topbar.search.groups.devices": "Devices",
    "topbar.search.groups.zones": "Zones",
    "topbar.search.groups.faults": "Faults",
    "common.severity.warning": "warning",
  }),
);

function asset(id: string, name: string, path: string[]): Asset {
  return {
    id,
    parent_id: null,
    type: "zone",
    name,
    path,
    position: 0,
  } as Asset;
}

const building = asset("b1", "Building A", ["b1"]);
const room = asset("r1", "Suite 701", ["b1", "r1"]);

const thermostat = {
  id: "d1",
  name: "Chambre 101",
  type: "thermostat",
} as Device;

const fault: FaultView = {
  device_id: "d1",
  device_name: "Chambre 101",
  attribute_name: "filter_clogged",
  data_type: "bool",
  severity: "warning",
  current_value: true,
  last_updated: "2026-08-04T10:00:00Z",
  last_changed: "2026-08-04T10:00:00Z",
};

type AssetTreeResult = {
  assetsList: Asset[];
  assetsById: Record<string, Asset>;
  assetTree: never[];
  isLoading: boolean;
};

const useAssetTree = vi.fn(
  (): AssetTreeResult => ({
    assetsList: [building, room],
    assetsById: { b1: building, r1: room },
    assetTree: [],
    isLoading: false,
  }),
);

const useDevicesList = vi.fn(() => ({
  devices: [thermostat],
  loading: false,
  error: null,
}));

const useFaultsList = vi.fn(() => ({
  faults: [fault],
  loading: false,
  error: null,
}));

vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => useAssetTree(),
}));
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => useDevicesList(),
}));
vi.mock("@/hooks/useFaultsList", () => ({
  useFaultsList: () => useFaultsList(),
}));

import { GlobalSearch } from "./GlobalSearch";

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="pathname">{pathname}</div>;
}

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={["/drivers"]}>
      <GlobalSearch />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAssetTree.mockClear();
  useDevicesList.mockClear();
  useFaultsList.mockClear();
});
afterEach(cleanup);

describe("GlobalSearch", () => {
  it("renders a button dressed as an input, not an editable field", () => {
    renderSearch();
    const trigger = screen.getByRole("button", { name: "Global search" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveTextContent("Search a device, a zone, a fault…");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  // Guards the lazy-mount decision: the asset tree is the heaviest read in the
  // app and the topbar is on every route.
  it("does not fetch anything before the palette is opened", () => {
    renderSearch();
    expect(useAssetTree).not.toHaveBeenCalled();
    expect(useDevicesList).not.toHaveBeenCalled();
    expect(useFaultsList).not.toHaveBeenCalled();
  });

  it("opens the palette on click and then queries the sources", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Global search" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(useAssetTree).toHaveBeenCalled();
    expect(useDevicesList).toHaveBeenCalled();
    expect(useFaultsList).toHaveBeenCalled();
  });

  it("opens on Meta+K", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens on Control+K", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("labels the dialog for assistive tech", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Global search" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(
      "Global search",
    );
  });

  it("shows the three result groups", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Global search" }));
    await screen.findByRole("dialog");
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("Zones")).toBeInTheDocument();
    expect(screen.getByText("Faults")).toBeInTheDocument();
  });

  it("navigates to the device on selection", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Global search" }));
    await user.click(
      await screen.findByRole("option", { name: /^Chambre 101$/ }),
    );
    expect(screen.getByTestId("pathname")).toHaveTextContent("/devices/d1");
  });

  it("lists a zone with its ancestor path", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Global search" }));
    const option = await screen.findByRole("option", { name: /Suite 701/ });
    expect(option).toHaveTextContent("Suite 701");
    expect(option).toHaveTextContent("Building A");
  });

  it("navigates to the zone on selection", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Global search" }));
    await user.click(await screen.findByRole("option", { name: /Suite 701/ }));
    expect(screen.getByTestId("pathname")).toHaveTextContent("/assets/r1");
  });

  it("navigates to the faulty device when a fault is selected", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Global search" }));
    await user.click(
      await screen.findByRole("option", { name: /Filter Clogged/ }),
    );
    expect(screen.getByTestId("pathname")).toHaveTextContent("/devices/d1");
  });

  it("says it is loading rather than reporting no results", async () => {
    useAssetTree.mockReturnValue({
      assetsList: [],
      assetsById: {},
      assetTree: [],
      isLoading: true,
    });
    useDevicesList.mockReturnValue({ devices: [], loading: true, error: null });
    useFaultsList.mockReturnValue({ faults: [], loading: true, error: null });
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Global search" }));
    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("No results")).not.toBeInTheDocument();
  });
});
