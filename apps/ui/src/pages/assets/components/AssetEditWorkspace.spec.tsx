import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Asset, Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AssetFormValues } from "./AssetForm";

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Zones",
    "types.org": "Organization",
    "types.building": "Building",
    "types.floor": "Floor",
    "types.room": "Room",
    "types.zone": "Zone",
    "overview.subzoneCount": "{{count}} sub-zones",
    "overview.deviceCount": "{{count}} devices",
    "editPage.breadcrumbLabel": "Zone location",
    "editPage.editingHint": "Edit this zone.",
    "editPage.overviewHint": "Zone overview.",
    "editPage.addSubzone": "Add a sub-zone",
    "editPage.saveChanges": "Save changes",
    "editPage.add": "Add",
    "editPage.identity.title": "Identity",
    "editPage.identity.description": "Identity description",
    "editPage.identity.identifier": "Identifier",
    "editPage.location.title": "Place in the building",
    "editPage.location.description": "Location description",
    "editPage.location.moveHint": "Move hint",
    "editPage.location.move": "Move this zone",
    "editPage.subzones.title": "Sub-zones",
    "editPage.subzones.description": "Sub-zone description",
    "editPage.subzones.reorder": "Reorder {{name}}",
    "editPage.devices.title": "Linked devices",
    "editPage.devices.description": "Device description",
    "fields.name": "Name",
    "fields.type": "Type",
    "fields.parent": "Parent zone",
    "fields.parentPlaceholder": "None",
    "overview.addSubzoneTo": "Add a sub-zone to {{name}}",
    "devices.link": "Link device",
    "devices.noDevices": "No devices linked",
    noChildren: "No child zones",
    deleteConfirmTitle: "Delete zone",
    deleteConfirmDetails: "Delete {{name}}?",
    "common:common.cancel": "Cancel",
    "common:common.update": "Update",
    "common:common.saving": "Saving…",
    "common:common.unknown": "Unknown",
    "thermostat.name": "Thermostat",
    "common.delete": "Delete",
  }),
);

import { AssetEditWorkspace, reorderedIds } from "./AssetEditWorkspace";

const organization: Asset = {
  id: "org",
  parent_id: null,
  type: "org",
  name: "Agrid",
  path: ["org"],
};
const building: Asset = {
  id: "building",
  parent_id: "org",
  type: "building",
  name: "Hotel Lumen",
  path: ["org", "building"],
};
const floor: Asset = {
  id: "floor",
  parent_id: "building",
  type: "floor",
  name: "Ground floor",
  path: ["org", "building", "floor"],
};
const lobby: Asset = {
  id: "lobby",
  parent_id: "floor",
  type: "zone",
  name: "Lobby",
  path: ["org", "building", "floor", "lobby"],
};
const bar: Asset = {
  id: "bar",
  parent_id: "lobby",
  type: "room",
  name: "Bar",
  path: ["org", "building", "floor", "lobby", "bar"],
  position: 0,
};
// Alphabetically first but positioned last — proves position beats name.
const atrium: Asset = {
  id: "atrium",
  parent_id: "lobby",
  type: "room",
  name: "Atrium",
  path: ["org", "building", "floor", "lobby", "atrium"],
  position: 1,
};
const thermostat: Device = {
  id: "thermostat",
  name: "Lobby thermostat",
  type: "thermostat",
  tags: { asset_id: "lobby" },
  attributes: {},
  config: {},
  driver_id: "driver",
  transport_id: "transport",
};

const allAssets = [organization, building, floor, lobby, bar];

function renderWorkspace({
  mode = "edit",
  canWriteAssets = true,
  childAssets = [bar],
  onSubmit = vi.fn<(data: AssetFormValues) => void>(),
  onLinkDevice = vi.fn<() => void>(),
  onReorder,
}: {
  mode?: "detail" | "edit";
  canWriteAssets?: boolean;
  childAssets?: Asset[];
  onSubmit?: (data: AssetFormValues) => void;
  onLinkDevice?: () => void;
  onReorder?: (orderedIds: string[]) => void;
} = {}) {
  render(
    <MemoryRouter>
      <TooltipProvider>
        <AssetEditWorkspace
          mode={mode}
          asset={lobby}
          allAssets={allAssets}
          childAssets={childAssets}
          devices={[thermostat]}
          deviceIds={[thermostat.id]}
          isPending={false}
          isDeleting={false}
          canWriteAssets={canWriteAssets}
          canWriteDevices
          onSubmit={onSubmit}
          onDelete={vi.fn<() => void>()}
          onLinkDevice={onLinkDevice}
          onReorder={onReorder}
        />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("AssetEditWorkspace", () => {
  it("presents the zone in its building context without the organization level", () => {
    renderWorkspace();

    const breadcrumb = screen.getByRole("navigation", {
      name: "Zone location",
    });
    expect(
      within(breadcrumb).getByRole("link", { name: "Zones" }),
    ).toHaveAttribute("href", "/assets");
    expect(
      within(breadcrumb).getByRole("link", { name: "Hotel Lumen" }),
    ).toBeInTheDocument();
    expect(
      within(breadcrumb).queryByRole("link", { name: "Agrid" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 sub-zones")).toBeInTheDocument();
    expect(screen.getByText("1 devices")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Identity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Place in the building" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bar Room" })).toHaveAttribute(
      "href",
      "/assets/bar",
    );
    expect(
      screen.getByRole("link", { name: "Lobby thermostat Thermostat" }),
    ).toHaveAttribute("href", "/devices/thermostat");
  });

  it("submits the three existing asset fields and opens device linking", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(data: AssetFormValues) => void>();
    const onLinkDevice = vi.fn<() => void>();
    renderWorkspace({ onSubmit, onLinkDevice });

    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Main lobby");

    // The primary header action commits the form from outside it, so that
    // changing the parent zone doesn't send users hunting in another card.
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save.closest("form")).toBeNull();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/assets/lobby",
    );
    await user.click(save);

    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({
        name: "Main lobby",
        type: "zone",
        parentId: "floor",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Link device" }));
    expect(onLinkDevice).toHaveBeenCalledOnce();
  });

  it("keeps the form visible but disabled for read-only users", () => {
    renderWorkspace({ canWriteAssets: false });

    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Parent zone" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Add a sub-zone" }),
    ).not.toBeInTheDocument();
  });

  it("orders sub-zones by curated position and offers drag handles to writers", () => {
    renderWorkspace({ childAssets: [atrium, bar], onReorder: vi.fn() });

    // Input order and alphabetical order both put Atrium first; the curated
    // position order (Bar=0, Atrium=1) must win.
    const rows = screen.getAllByRole("link", { name: /Room$/ });
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      "/assets/bar",
      "/assets/atrium",
    ]);
    expect(
      screen.getByRole("button", { name: "Reorder Bar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder Atrium" }),
    ).toBeInTheDocument();
  });

  it("hides drag handles from read-only users and single-child lists", () => {
    renderWorkspace({
      childAssets: [atrium, bar],
      canWriteAssets: false,
      onReorder: vi.fn(),
    });
    expect(
      screen.queryByRole("button", { name: /Reorder/ }),
    ).not.toBeInTheDocument();

    cleanup();

    renderWorkspace({ childAssets: [bar], onReorder: vi.fn() });
    expect(
      screen.queryByRole("button", { name: /Reorder/ }),
    ).not.toBeInTheDocument();
  });

  it("uses the new workspace as a read-only overview on the detail route", () => {
    renderWorkspace({ mode: "detail" });

    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Update" })).toHaveAttribute(
      "href",
      "/assets/lobby/edit",
    );
    expect(
      screen.getByRole("link", { name: "Move this zone" }),
    ).toHaveAttribute("href", "/assets/lobby/edit");
    // Supervising: the primary action adds a sub-zone, there is nothing to save.
    expect(
      screen.getByRole("link", { name: "Add a sub-zone" }),
    ).toHaveAttribute("href", "/assets/new?parentId=lobby&type=zone");
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
  });
});

describe("reorderedIds", () => {
  const ids = ["a", "b", "c"];

  it("moves the dragged id to the drop target's slot", () => {
    expect(
      reorderedIds(ids, { active: { id: "c" }, over: { id: "a" } }),
    ).toEqual(["c", "a", "b"]);
    expect(
      reorderedIds(ids, { active: { id: "a" }, over: { id: "b" } }),
    ).toEqual(["b", "a", "c"]);
  });

  it("returns null when the drop changes nothing", () => {
    expect(reorderedIds(ids, { active: { id: "a" }, over: null })).toBeNull();
    expect(
      reorderedIds(ids, { active: { id: "a" }, over: { id: "a" } }),
    ).toBeNull();
    expect(
      reorderedIds(ids, { active: { id: "ghost" }, over: { id: "a" } }),
    ).toBeNull();
  });
});
