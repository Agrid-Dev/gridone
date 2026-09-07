import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { viewerThemeFixture as theme } from "@/test/viewerTheme";
import type { LevelSummary } from "./levelSummaries";
import type { RoomState } from "./roomStates";

vi.mock("react-i18next", () =>
  createI18nMock({
    "zonesByLevel.viewer.levels": "Levels",
    "zonesByLevel.viewer.expandPanel": "Expand the levels panel",
    "zonesByLevel.viewer.collapsePanel": "Collapse the levels panel",
    "zonesByLevel.viewer.toggleZones": "Zones of {{level}}",
    "zonesByLevel.viewer.breadcrumb.label": "Where you are in the model",
    "zonesByLevel.viewer.breadcrumb.allLevels": "All levels",
    "zonesByLevel.viewer.breadcrumb.plan": "Floor plan",
    "zonesByLevel.viewer.searchGroups.zones": "Zones",
    "zonesByLevel.viewer.searchGroups.devices": "Devices",
    "zonesByLevel.viewer.searchGroups.offModel": "Not on the model",
    "zonesByLevel.viewer.searchMore": "{{count}} more results",
    "zonesByLevel.viewer.levelZones": "Zones: {{count}}",
    "zonesByLevel.viewer.levelAlerts": "Alerts: {{count}}",
    "zonesByLevel.viewer.noZones": "No zone on this level.",
    "zonesByLevel.viewer.searchPlaceholder": "Search a zone or a device…",
    "zonesByLevel.viewer.searchClear": "Clear search",
    "zonesByLevel.viewer.searchNoResults": "No matching zone.",
    "zonesByLevel.viewer.planOpen": "Floor plan of {{level}}",
  }),
);

import { LevelPanel, type LevelPanelProps } from "./LevelPanel";

const levels: LevelSummary[] = [
  {
    globalId: "st-1",
    name: "R+1",
    short: "R+1",
    index: 1,
    zoneCount: 2,
    alertCount: 1,
    zones: [
      {
        globalId: "s1",
        name: "Chambre 101",
        temperature: 21.4,
        severity: "alert",
        objectType: "Chambre Twin",
        connection: "error",
      },
      {
        globalId: "s2",
        name: "Chambre 102",
        temperature: null,
        severity: null,
        objectType: "Chambre Classique",
        connection: null,
      },
    ],
  },
  {
    globalId: "st-0",
    name: "RDC",
    short: "RDC",
    index: 0,
    zoneCount: 0,
    alertCount: 0,
    zones: [],
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
  ["s2", roomState("s2", "a2", "Chambre 102")],
]);

const devices = [
  {
    id: "d1",
    name: "Thermostat 101",
    type: "thermostat",
    tags: { asset_id: "a1" },
  },
  { id: "d2", name: "Compteur général", type: "electricity_meter", tags: {} },
] as unknown as Device[];

function renderPanel(overrides: Partial<LevelPanelProps> = {}) {
  const handlers = {
    onToggleExpanded: vi.fn(),
    onFocusLevel: vi.fn(),
    onSelectZone: vi.fn(),
    onSelectDevice: vi.fn(),
    onGoToDepth: vi.fn(),
    onTogglePlan: vi.fn(),
  };
  const result = render(
    <LevelPanel
      levels={levels}
      devices={devices}
      roomStates={roomStates}
      theme={theme}
      colorMode="temperature"
      expanded
      focusedLevelId={null}
      selectedZoneId={null}
      planActive={false}
      {...handlers}
      {...overrides}
    />,
    { wrapper: MemoryRouter },
  );
  return { ...handlers, ...result };
}

const searchBox = () =>
  screen.getByRole("searchbox", { name: "Search a zone or a device…" });

afterEach(cleanup);

describe("LevelPanel", () => {
  it("renders nothing when the building has no level", () => {
    const { container } = renderPanel({ levels: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the levels with their zone and alert counts", () => {
    renderPanel();
    expect(
      screen.getByRole("button", { name: "R+1 · Zones: 2 · Alerts: 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "RDC · Zones: 0" }),
    ).toBeInTheDocument();
  });

  it("collapses to a rail of storey chips", async () => {
    const { onToggleExpanded } = renderPanel({ expanded: false });
    expect(screen.queryByText("Levels")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", {
      name: "Expand the levels panel",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it("focuses a level, and clears the focus when it is picked again", async () => {
    const { onFocusLevel, rerender } = renderPanel();
    await userEvent.click(
      screen.getByRole("button", { name: "R+1 · Zones: 2 · Alerts: 1" }),
    );
    expect(onFocusLevel).toHaveBeenCalledExactlyOnceWith("st-1");

    onFocusLevel.mockClear();
    rerender(
      <LevelPanel
        levels={levels}
        devices={devices}
        roomStates={roomStates}
        theme={theme}
        colorMode="temperature"
        expanded
        focusedLevelId="st-1"
        selectedZoneId={null}
        planActive={false}
        onToggleExpanded={vi.fn()}
        onGoToDepth={vi.fn()}
        onFocusLevel={onFocusLevel}
        onSelectZone={vi.fn()}
        onSelectDevice={vi.fn()}
        onTogglePlan={vi.fn()}
      />,
    );
    const focused = screen.getByRole("button", {
      name: "R+1 · Zones: 2 · Alerts: 1",
    });
    expect(focused).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(focused);
    expect(onFocusLevel).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("offers the floor plan on the isolated level only", async () => {
    const { onTogglePlan } = renderPanel({ focusedLevelId: "st-1" });
    expect(
      screen.queryByRole("button", { name: "Floor plan of RDC" }),
    ).not.toBeInTheDocument();
    const plan = screen.getByRole("button", { name: "Floor plan of R+1" });
    expect(plan).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(plan);
    expect(onTogglePlan).toHaveBeenCalledTimes(1);
  });

  it("marks the plan button pressed while the plan is open", () => {
    renderPanel({ focusedLevelId: "st-1", planActive: true });
    expect(
      screen.getByRole("button", { name: "Floor plan of R+1" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the plan button when no level is isolated", () => {
    renderPanel();
    expect(
      screen.queryByRole("button", { name: /Floor plan of/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the zones folded until their level is unfolded", async () => {
    const { onSelectZone } = renderPanel();
    expect(screen.queryByText("Chambre 101")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Zones of R+1" }));
    expect(screen.getByText("Chambre 101")).toBeInTheDocument();
    expect(screen.getByText("21.4°")).toBeInTheDocument();
    // A zone with no thermostat still lists, with an em dash instead.
    expect(screen.getByText("—")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Chambre 101"));
    expect(onSelectZone).toHaveBeenCalledExactlyOnceWith("s1");
  });

  it("unfolds one level at a time", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Zones of R+1" }));
    await userEvent.click(screen.getByRole("button", { name: "Zones of RDC" }));
    expect(screen.queryByText("Chambre 101")).not.toBeInTheDocument();
    expect(screen.getByText("No zone on this level.")).toBeInTheDocument();
  });

  it("marks the selected zone as current", async () => {
    renderPanel({ selectedZoneId: "s1" });
    await userEvent.click(screen.getByRole("button", { name: "Zones of R+1" }));
    // The name also appears as the breadcrumb's current position, which is
    // text rather than a row.
    const zone = screen
      .getAllByText("Chambre 101")
      .map((node) => node.closest("button"))
      .find((node) => node !== null);
    expect(zone).toHaveAttribute("aria-current", "true");
  });

  it("colors the zone dot from the active mode", async () => {
    renderPanel({ colorMode: "alerts" });
    await userEvent.click(screen.getByRole("button", { name: "Zones of R+1" }));
    const alerting = screen.getByText("Chambre 101").closest("button");
    const dot = (alerting as HTMLElement).querySelector<HTMLElement>(
      "span[aria-hidden]",
    );
    // In alerts mode the alert zone's dot is red rather than a point on the
    // cool→heat gradient.
    const [r, g, b] = (dot?.style.background.match(/\d+/g) ?? []).map(Number);
    expect(r).toBeGreaterThan(g + 100);
    expect(r).toBeGreaterThan(b + 100);
  });

  it("flattens levels into search hits that select on click", async () => {
    const { onSelectZone } = renderPanel();
    // Zones are folded away until searched.
    expect(screen.queryByText("Chambre 102")).not.toBeInTheDocument();

    await userEvent.type(searchBox(), "102");
    const hit = screen.getByText("Chambre 102");
    expect(hit).toBeInTheDocument();
    // The non-matching zone is filtered out.
    expect(screen.queryByText("Chambre 101")).not.toBeInTheDocument();

    await userEvent.click(hit);
    expect(onSelectZone).toHaveBeenCalledExactlyOnceWith("s2");
  });

  it("flies to the first hit on Enter", async () => {
    const { onSelectZone } = renderPanel();
    await userEvent.type(searchBox(), "Chambre{Enter}");
    // Both zones match "Chambre"; Enter picks the first (R+1 before RDC).
    expect(onSelectZone).toHaveBeenCalledExactlyOnceWith("s1");
  });

  it("carries the breadcrumb above the search box", async () => {
    const { onGoToDepth } = renderPanel({
      focusedLevelId: "st-1",
    });
    const crumbs = screen.getByRole("navigation", {
      name: "Where you are in the model",
    });
    // It sits above the search box, not below it.
    expect(
      crumbs.compareDocumentPosition(searchBox()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "All levels" }));
    expect(onGoToDepth).toHaveBeenCalledExactlyOnceWith("building");
  });

  it("shows no breadcrumb at the whole building", () => {
    renderPanel();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("folds the breadcrumb away with the panel", () => {
    renderPanel({
      expanded: false,
      focusedLevelId: "st-1",
    });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("finds a device and flies to the room it is linked to", async () => {
    const { onSelectDevice } = renderPanel();
    await userEvent.type(searchBox(), "thermostat");

    expect(screen.getByText("Devices")).toBeInTheDocument();
    const hit = screen.getByText("Thermostat 101");
    // The row says where the device is: its room, and the floor of that room.
    expect(screen.getByText("Chambre 101")).toBeInTheDocument();
    expect(screen.getByText("R+1")).toBeInTheDocument();

    await userEvent.click(hit);
    expect(onSelectDevice).toHaveBeenCalledExactlyOnceWith("s1", "d1");
  });

  it("links out for a device the model cannot place", async () => {
    const { onSelectDevice } = renderPanel();
    await userEvent.type(searchBox(), "compteur");

    expect(screen.getByText("Not on the model")).toBeInTheDocument();
    const link = screen.getByText("Compteur général").closest("a");
    expect(link).toHaveAttribute("href", "/devices/d2");
    // It has no room to fly to, so it must never call the fly handler.
    expect(onSelectDevice).not.toHaveBeenCalled();
  });

  it("walks the hits with the arrow keys and comes back to the box", async () => {
    renderPanel();
    const box = searchBox();
    await userEvent.type(box, "chambre");

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByText("Chambre 101").closest("button")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByText("Chambre 102").closest("button")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByText("Chambre 101").closest("button")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(box).toHaveFocus();
  });

  it("clears the search on Escape instead of letting the viewer peel", async () => {
    renderPanel();
    const box = searchBox();
    await userEvent.type(box, "chambre{Escape}");
    expect(box).toHaveValue("");
    // Back to the levels list.
    expect(
      screen.getByRole("button", { name: "R+1 · Zones: 2 · Alerts: 1" }),
    ).toBeInTheDocument();
  });
});
