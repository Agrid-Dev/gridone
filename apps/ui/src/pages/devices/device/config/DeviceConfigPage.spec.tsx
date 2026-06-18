import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceKind, type Device } from "@/api/devices";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.config.identity.title": "Identity",
    "deviceDetails.config.identity.edit": "Edit identity",
    "deviceDetails.config.driverTransport.title": "Driver & network",
    "deviceDetails.config.driverTransport.edit": "Edit driver & network",
    "deviceDetails.config.config.title": "Configuration",
    "deviceDetails.config.config.edit": "Edit configuration",
    "deviceDetails.config.metadata.title": "Metadata",
    "deviceDetails.config.metadata.id": "Identifier",
    "deviceDetails.config.metadata.kind": "Kind",
    "deviceDetails.config.metadata.type": "Type",
    "deviceDetails.config.metadata.tags": "Tags",
    "devices.fields.name": "Device name",
    "devices.actions.delete": "Delete",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common:common.none": "None",
  }),
);

let currentDevice: Device;
let canWrite = true;

vi.mock("@/hooks/useDevice", () => ({
  useDeviceFromRoute: () => currentDevice,
}));
vi.mock("@/components/BreadcrumbProvider", () => ({ useBreadcrumb: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => canWrite,
}));
vi.mock("@/hooks/useDeleteDevice", () => ({
  useDeleteDevice: () => ({ handleDelete: vi.fn(), isDeleting: false }),
}));
vi.mock("@/pages/drivers/useDrivers", () => ({
  useDrivers: () => ({
    driversListQuery: { data: [], isLoading: false, error: null },
  }),
}));
vi.mock("@/pages/transports/useTransports", () => ({
  useTransports: () => ({
    transportsListQuery: { data: [], isLoading: false, error: null },
  }),
}));

const updateDevice = vi.fn(
  async (id: string, payload: Partial<Device>): Promise<Device> => {
    void id;
    void payload;
    return currentDevice;
  },
);
vi.mock("@/api/devices", async (importActual) => ({
  ...(await importActual<typeof import("@/api/devices")>()),
  updateDevice: (id: string, payload: Partial<Device>) =>
    updateDevice(id, payload),
}));

import DeviceConfigPage from "./DeviceConfigPage";

function makePhysical(): Device {
  return {
    id: "d1",
    kind: DeviceKind.Physical,
    name: "RTU-3",
    type: null,
    tags: {},
    driverId: "drv",
    transportId: "tr",
    config: {},
    attributes: {},
    isFaulty: false,
  };
}

function makeVirtual(): Device {
  return {
    id: "v1",
    kind: DeviceKind.Virtual,
    name: "Virtual 1",
    type: null,
    tags: {},
    attributes: {},
    isFaulty: false,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DeviceConfigPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  canWrite = true;
  updateDevice.mockClear();
});
afterEach(cleanup);

describe("DeviceConfigPage", () => {
  it("renders all four category cards for a physical device", () => {
    currentDevice = makePhysical();
    renderPage();

    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Driver & network")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
  });

  it("renders only Identity and Metadata for a virtual device", () => {
    currentDevice = makeVirtual();
    renderPage();

    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
    expect(screen.queryByText("Driver & network")).not.toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
  });

  it("shows no edit or delete affordances without write permission", () => {
    currentDevice = makePhysical();
    canWrite = false;
    renderPage();

    expect(
      screen.queryByRole("button", { name: "Edit identity" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("saves only the identity fields via a partial update", async () => {
    currentDevice = makePhysical();
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit identity" }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "RTU-9");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateDevice).toHaveBeenCalledWith("d1", { name: "RTU-9" }),
    );
    expect(updateDevice).toHaveBeenCalledTimes(1);
  });

  it("edits one card at a time and restores on cancel", async () => {
    currentDevice = makePhysical();
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit identity" }));

    // Other cards' edit affordances disappear while one card is editing.
    expect(
      screen.queryByRole("button", { name: "Edit driver & network" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updateDevice).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Edit identity" }),
    ).toBeInTheDocument();
  });
});
