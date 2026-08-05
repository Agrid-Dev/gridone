import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "devicesSection.title": "Attached devices",
    "devicesSection.empty": "No attached devices",
    "devicesSection.error": "Unable to load devices",
    device: "{{count}} devices",
  }),
);

const mockUseDevicesList = vi.fn();
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: (...args: unknown[]) => mockUseDevicesList(...args),
}));

vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({
    assetTree: [],
    assetsList: [],
    assetsById: {},
    assetByDeviceId: { d1: { id: "room-101", name: "Room 101" } },
    isLoading: false,
  }),
}));

import { TransportDevicesSection } from "./TransportDevicesSection";

function device(id: string, name: string): Device {
  return {
    id,
    name,
    type: "thermostat",
    tags: {},
    driver_id: "thermostat_knx",
    transport_id: "tr-1",
    config: {},
    attributes: {},
    is_faulty: false,
  };
}

afterEach(() => {
  cleanup();
  mockUseDevicesList.mockReset();
});

it("loads attached devices server-side and renders compact linked rows", () => {
  mockUseDevicesList.mockReturnValue({
    devices: [device("d2", "Zulu"), device("d1", "Alpha")],
    loading: false,
    error: null,
  });
  render(
    <MemoryRouter>
      <TransportDevicesSection transportId="tr-1" />
    </MemoryRouter>,
  );

  expect(mockUseDevicesList).toHaveBeenCalledWith({ transport_id: "tr-1" });
  expect(screen.getByText("2 devices")).toBeInTheDocument();
  expect(screen.getByText("Room 101")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Alpha/ })).toHaveAttribute(
    "href",
    "/devices/d1",
  );
  expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
    expect.stringContaining("Alpha"),
    expect.stringContaining("Zulu"),
  ]);
});

it("renders the empty state", () => {
  mockUseDevicesList.mockReturnValue({
    devices: [],
    loading: false,
    error: null,
  });
  render(
    <MemoryRouter>
      <TransportDevicesSection transportId="tr-1" />
    </MemoryRouter>,
  );
  expect(screen.getByText("No attached devices")).toBeInTheDocument();
});

it("renders an error state", () => {
  mockUseDevicesList.mockReturnValue({
    devices: [],
    loading: false,
    error: "boom",
  });
  render(
    <MemoryRouter>
      <TransportDevicesSection transportId="tr-1" />
    </MemoryRouter>,
  );
  expect(screen.getByText("Unable to load devices")).toBeInTheDocument();
});
