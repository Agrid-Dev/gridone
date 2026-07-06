import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import { type Device } from "@/api/devices";
import { DeviceTabs } from "./DeviceTabs";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.tabs.label": "Device sections",
    "deviceDetails.tabs.overview": "Overview",
    "deviceDetails.tabs.history": "History",
    "deviceDetails.tabs.commands": "Commands",
    "deviceDetails.tabs.config": "Config",
  }),
);

function makeDevice({
  readWriteModes = ["read", "write"],
}: { readWriteModes?: string[] } = {}): Device {
  return {
    id: "d1",
    name: "RTU-3",
    type: null,
    tags: {},
    attributes: {
      value: {
        kind: "standard" as const,
        name: "value",
        dataType: "float",
        readWriteModes,
        currentValue: null,
        lastUpdated: null,
        lastChanged: null,
      },
    },
    isFaulty: false,
    driverId: "drv",
    transportId: "tr",
    config: {},
  };
}

function renderAt(path: string, device: Device) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DeviceTabs device={device} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("DeviceTabs", () => {
  it("shows Overview, History, Commands and Config with correct routes", () => {
    renderAt("/devices/d1", makeDevice());

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "href",
      "/devices/d1",
    );
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute(
      "href",
      "/devices/d1/history",
    );
    expect(screen.getByRole("tab", { name: "Commands" })).toHaveAttribute(
      "href",
      "/devices/d1/commands",
    );
    expect(screen.getByRole("tab", { name: "Config" })).toHaveAttribute(
      "href",
      "/devices/d1/config",
    );
  });

  it("keeps Commands as a normal tab for a read-only device (panel handles the empty state)", () => {
    renderAt("/devices/d1", makeDevice({ readWriteModes: ["read"] }));

    expect(screen.getByRole("tab", { name: "Commands" })).toHaveAttribute(
      "href",
      "/devices/d1/commands",
    );
  });

  it("marks Overview active only on the index route", () => {
    renderAt("/devices/d1", makeDevice());

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("tab", { name: "History" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks History active on a history sub-route", () => {
    renderAt("/devices/d1/history/chart", makeDevice());

    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("tab", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
