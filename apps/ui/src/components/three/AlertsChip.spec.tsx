import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Device, FaultView } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import type { LevelSummary } from "./levelSummaries";
import type { RoomState } from "./roomStates";

vi.mock("react-i18next", () =>
  createI18nMock({
    "zonesByLevel.viewer.alerts.label": "{{count}} zones in alert",
    "zonesByLevel.viewer.alerts.title": "Zones in alert",
    "zonesByLevel.viewer.alerts.warnings": "Warnings",
    "zonesByLevel.viewer.alerts.faults": "{{count}} faults",
    "zonesByLevel.viewer.alerts.offModel": "{{count}} outside the model",
  }),
);

const faultsMock = vi.fn();
vi.mock("@/hooks/useFaultsList", () => ({
  useFaultsList: () => ({ faults: faultsMock(), loading: false, error: null }),
}));

import { AlertsChip } from "./AlertsChip";

function zone(globalId: string, name: string) {
  return {
    globalId,
    name,
    temperature: null,
    severity: null,
    objectType: null,
    connection: null,
  };
}

const levels: LevelSummary[] = [
  {
    globalId: "st-2",
    name: "R+2",
    short: "R+2",
    index: 2,
    zoneCount: 1,
    alertCount: 1,
    zones: [zone("s2", "Chambre 201")],
  },
  {
    globalId: "st-1",
    name: "R+1",
    short: "R+1",
    index: 1,
    zoneCount: 1,
    alertCount: 1,
    zones: [zone("s1", "Chambre 101")],
  },
];

function roomState(globalId: string, assetId: string, name: string): RoomState {
  return {
    globalId,
    assetId,
    name,
    temperature: null,
    severity: null,
    objectType: null,
    connection: null,
    devices: [],
  };
}

const roomStates = new Map<string, RoomState>([
  ["s1", roomState("s1", "a1", "Chambre 101")],
  ["s2", roomState("s2", "a2", "Chambre 201")],
]);

const devices = [
  { id: "d1", name: "Thermostat 101", tags: { asset_id: "a1" } },
  { id: "d2", name: "Thermostat 201", tags: { asset_id: "a2" } },
  { id: "d9", name: "Compteur général", tags: {} },
] as unknown as Device[];

function fault(
  deviceId: string,
  deviceName: string,
  attribute: string,
  severity: "alert" | "warning",
): FaultView {
  return {
    device_id: deviceId,
    device_name: deviceName,
    attribute_name: attribute,
    data_type: "bool",
    severity,
    current_value: true,
    last_updated: "2026-09-03T10:00:00Z",
    last_changed: "2026-09-03T10:00:00Z",
  } as unknown as FaultView;
}

function renderChip(faults: FaultView[]) {
  faultsMock.mockReturnValue(faults);
  const onFocusRoom = vi.fn();
  // A fresh element every time: React bails out of re-rendering a subtree
  // handed back the very same element reference, which would make a refetch
  // look frozen even when nothing froze it.
  const chip = () => (
    <AlertsChip
      devices={devices}
      roomStates={roomStates}
      levels={levels}
      onFocusRoom={onFocusRoom}
    />
  );
  const { rerender } = render(chip(), { wrapper: MemoryRouter });
  /** What the 10s fault poll does: new data, then a re-render. */
  const refetch = (next: FaultView[]) => {
    faultsMock.mockReturnValue(next);
    rerender(chip());
  };
  return { onFocusRoom, refetch };
}

afterEach(() => {
  cleanup();
  faultsMock.mockReset();
});

describe("AlertsChip", () => {
  it("stays out of the way when nothing is wrong", () => {
    renderChip([]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("counts zones in alert, not faults, so it matches the level badges", async () => {
    renderChip([
      fault("d1", "Thermostat 101", "comm_error", "alert"),
      fault("d1", "Thermostat 101", "battery_low", "alert"),
      fault("d2", "Thermostat 201", "comm_error", "alert"),
    ]);
    const chip = screen.getByRole("button", { name: "2 zones in alert" });
    expect(chip).toHaveTextContent("2");
    expect(levels[0].alertCount + levels[1].alertCount).toBe(2);
  });

  it("lists every alerting room, highest floor first, and flies on click", async () => {
    const { onFocusRoom } = renderChip([
      fault("d1", "Thermostat 101", "comm_error", "alert"),
      fault("d2", "Thermostat 201", "comm_error", "alert"),
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: /zones in alert/ }),
    );

    const rooms = screen.getAllByText(/Chambre/);
    expect(rooms.map((node) => node.textContent)).toEqual([
      "Chambre 201",
      "Chambre 101",
    ]);

    await userEvent.click(screen.getByText("Thermostat 101"));
    expect(onFocusRoom).toHaveBeenCalledExactlyOnceWith("s1", "d1");
  });

  it("collapses a device's faults into one row carrying the count", async () => {
    renderChip([
      fault("d1", "Thermostat 101", "comm_error", "alert"),
      fault("d1", "Thermostat 101", "battery_low", "alert"),
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: /zones in alert/ }),
    );
    expect(screen.getAllByText("Thermostat 101")).toHaveLength(1);
    expect(screen.getByText("2 faults")).toBeInTheDocument();
  });

  it("keeps warnings out of the headline but inside the list", async () => {
    renderChip([
      fault("d1", "Thermostat 101", "comm_error", "alert"),
      fault("d2", "Thermostat 201", "filter_dirty", "warning"),
    ]);
    const chip = screen.getByRole("button", { name: "1 zones in alert" });
    expect(chip).toHaveTextContent("1");
    await userEvent.click(chip);
    expect(screen.getByText("Zones in alert")).toBeInTheDocument();
    expect(screen.getByText("Warnings")).toBeInTheDocument();
  });

  it("falls back to the warning count when nothing is in alert", () => {
    renderChip([fault("d1", "Thermostat 101", "filter_dirty", "warning")]);
    expect(screen.getByRole("button")).toHaveTextContent("1");
  });

  it("reports the faults the model cannot place instead of dropping them", async () => {
    renderChip([fault("d9", "Compteur général", "comm_error", "alert")]);
    // No room to fly to, so no headline count — but the chip still appears.
    const chip = screen.getByRole("button");
    await userEvent.click(chip);
    const link = screen.getByText("1 outside the model").closest("a");
    expect(link).toHaveAttribute("href", "/faults");
  });

  it("freezes the list while it is open, so a refetch cannot move a row", async () => {
    const { onFocusRoom, refetch } = renderChip([
      fault("d1", "Thermostat 101", "comm_error", "alert"),
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: /zones in alert/ }),
    );
    expect(screen.getByText("Thermostat 101")).toBeInTheDocument();

    // The poll returns a completely different picture while the list is open.
    refetch([fault("d2", "Thermostat 201", "comm_error", "alert")]);
    expect(screen.getByText("Thermostat 101")).toBeInTheDocument();
    expect(screen.queryByText("Thermostat 201")).not.toBeInTheDocument();

    // The row the pointer was over is still the row that gets clicked.
    await userEvent.click(screen.getByText("Thermostat 101"));
    expect(onFocusRoom).toHaveBeenCalledExactlyOnceWith("s1", "d1");
  });

  it("picks the fresh list up again once it is closed", async () => {
    const { refetch } = renderChip([
      fault("d1", "Thermostat 101", "comm_error", "alert"),
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: /zones in alert/ }),
    );
    refetch([fault("d2", "Thermostat 201", "comm_error", "alert")]);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      screen.getByRole("button", { name: /zones in alert/ }),
    );
    expect(screen.getByText("Thermostat 201")).toBeInTheDocument();
    expect(screen.queryByText("Thermostat 101")).not.toBeInTheDocument();
  });
});
