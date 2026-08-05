import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import type { Asset, Device } from "@gridone/sdk";
import { DeviceHeader } from "./DeviceHeader";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.backToDevices": "Devices",
    "deviceDetails.sendCommand": "Send a command",
  }),
);

const assetByDeviceId: Record<string, Asset> = {};

vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({
    assetTree: [],
    assetsList: [],
    assetsById: {},
    assetByDeviceId,
    isLoading: false,
  }),
}));

function makeDevice(): Device {
  return {
    id: "d1",
    name: "Chambre 101",
    type: null,
    tags: {},
    attributes: {},
    is_faulty: false,
    driver_id: "drv",
    transport_id: "tr",
    config: {},
  };
}

function renderHeader(device = makeDevice()) {
  return render(
    <MemoryRouter>
      <DeviceHeader device={device} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  delete assetByDeviceId["d1"];
});

describe("DeviceHeader", () => {
  it("links back to the devices list", () => {
    renderHeader();

    expect(screen.getByRole("link", { name: "Devices" })).toHaveAttribute(
      "href",
      "/devices",
    );
  });

  it("links the send-command action to the device's new-command form", () => {
    renderHeader();

    expect(
      screen.getByRole("link", { name: "Send a command" }),
    ).toHaveAttribute("href", "/devices/d1/commands/new");
  });

  it("shows the owning asset as a chip when the tree maps the device", () => {
    assetByDeviceId["d1"] = {
      id: "a1",
      parent_id: null,
      type: "floor",
      name: "Étage 1",
      path: ["a0", "a1"],
      position: 0,
    };
    renderHeader();

    expect(screen.getByText("Étage 1")).toBeInTheDocument();
  });

  it("shows no asset chip when the device maps to no asset", () => {
    renderHeader();

    expect(screen.queryByText("Étage 1")).not.toBeInTheDocument();
  });
});
