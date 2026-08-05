import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Device, Transport } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Networks",
    caption: "Network connections",
    createAction: "Create network",
    empty: "No networks",
    unableToLoad: "Unable to load networks",
    "table.network": "Network",
    "table.drivers": "Drivers",
    "table.protocol": "Protocol",
    "table.connection": "Connection",
    "table.devices": "Devices",
    "protocols.knx": "KNX",
    "protocols.http": "HTTP",
    "connection.http": "Configured per device",
    "status.ok": "Connected",
    "status.idle": "Idle",
    "status.unknown": "Unknown",
  }),
);

const mockUseTransports = vi.fn();
vi.mock("./useTransports", () => ({
  useTransports: () => mockUseTransports(),
}));

const mockUseDevicesList = vi.fn();
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => mockUseDevicesList(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => true,
}));

import TransportsList from "./TransportsList";

function network(
  id: string,
  name: string,
  protocol: Transport["protocol"],
  config: Record<string, unknown>,
): Transport {
  return {
    id,
    name,
    protocol,
    config,
    connection_state: { status: protocol === "http" ? "idle" : "ok" },
  } as Transport;
}

function device(id: string, transportId: string, driverId: string): Device {
  return {
    id,
    name: id,
    type: null,
    tags: {},
    driver_id: driverId,
    transport_id: transportId,
    config: {},
    attributes: {},
    is_faulty: false,
  };
}

beforeEach(() => {
  mockUseTransports.mockReturnValue({
    transportsListQuery: {
      data: [
        network("tr-2", "Zulu", "http", { request_timeout: 10 }),
        network("tr-1", "Alpha", "knx", { gateway_ip: "10.0.0.30" }),
      ],
      isLoading: false,
      isError: false,
    },
  });
  mockUseDevicesList.mockReturnValue({
    devices: [
      device("d1", "tr-1", "thermostat_knx"),
      device("d2", "tr-1", "thermostat_knx"),
      device("d3", "tr-1", "lighting_knx"),
    ],
    loading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  mockUseTransports.mockReset();
  mockUseDevicesList.mockReset();
});

it("renders a scan-friendly table with endpoint, drivers, state and counts", () => {
  render(
    <MemoryRouter>
      <TransportsList />
    </MemoryRouter>,
  );

  const rows = screen.getAllByRole("row");
  expect(rows).toHaveLength(3);

  const alpha = screen.getByRole("link", { name: "Alpha" }).closest("tr");
  expect(alpha).not.toBeNull();
  expect(within(alpha!).getByText("10.0.0.30:3671")).toBeInTheDocument();
  expect(within(alpha!).getByText("Connected")).toBeInTheDocument();
  expect(within(alpha!).getByText("3")).toBeInTheDocument();
  expect(
    within(alpha!).getByRole("link", { name: "lighting_knx" }),
  ).toHaveAttribute("href", "/drivers/lighting_knx");
  expect(
    within(alpha!).getByRole("link", { name: "thermostat_knx" }),
  ).toBeInTheDocument();

  const networkLinks = screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.startsWith("/transports/"));
  expect(networkLinks.map((link) => link.textContent)).toEqual([
    "Alpha",
    "Zulu",
  ]);
});

it("renders loading rows while network or device data is loading", () => {
  mockUseDevicesList.mockReturnValue({
    devices: [],
    loading: true,
    error: null,
  });
  render(
    <MemoryRouter>
      <TransportsList />
    </MemoryRouter>,
  );
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
