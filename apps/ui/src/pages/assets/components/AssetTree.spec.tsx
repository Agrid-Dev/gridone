import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { AssetType } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import type { AssetTreeNode } from "@/lib/assets";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("react-i18next", () =>
  createI18nMock({
    "overview.legend": "Zone types",
    "overview.floorCount": "{{count}} floors",
    "overview.zoneCount": "{{count}} zones",
    "overview.deviceCount": "{{count}} devices",
    "overview.linkedDevices": "{{count}} linked devices",
    "overview.subzoneCount": "{{count}} sub-zones",
    "overview.otherZones": "Other zones",
    "overview.noFloors": "No floors have been added yet.",
    "overview.addBuilding": "Add a building",
    "overview.addFloor": "Add a floor",
    "overview.addZoneTo": "Add a zone to {{name}}",
    "overview.addSubzoneTo": "Add a sub-zone to {{name}}",
    "types.org": "Organization",
    "types.building": "Building",
    "types.room": "Room",
    "types.zone": "Zone",
    "usages.hotel_room": "Hotel room",
    "usages.common_area": "Common area",
    "fields.usage": "Usage",
    "fields.usageNone": "Unclassified",
    "selection.select": "Select {{name}}",
    "selection.selectAll": "Select every zone of {{name}}",
    "selection.count": "{{count}} zones selected",
    "selection.usagePlaceholder": "Choose a usage",
    "selection.apply": "Apply",
    "selection.clear": "Clear selection",
  }),
);

import type { AssetUsage } from "@gridone/sdk";
import { useAssetSelection } from "@/hooks/useAssetSelection";
import { AssetTree } from "./AssetTree";

function assetNode(
  id: string,
  type: AssetType,
  name: string,
  children: AssetTreeNode[] = [],
  deviceCount = 0,
  usage: AssetUsage | null = null,
): AssetTreeNode {
  return {
    id,
    type,
    name,
    parent_id: null,
    path: [id],
    position: 0,
    usage,
    children,
    devices: Array.from({ length: deviceCount }, (_, index) => ({
      id: `${id}-device-${index}`,
      name: `${name} device ${index}`,
    })),
  };
}

const suite = assetNode(
  "suite-301",
  "room",
  "Suite 301",
  [assetNode("salon", "zone", "Salon", [], 1)],
  1,
);
const room = assetNode("room-302", "room", "Room 302", [], 0, "hotel_room");
const floor = assetNode("floor-3", "floor", "Floor 3", [suite, room]);
const building = assetNode("building-1", "building", "Hotel Bellevue", [floor]);
const organization = assetNode("org-1", "org", "Agrid", [building]);

function renderOverview(canEdit = true) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <AssetTree tree={[organization]} canEdit={canEdit} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

/** The tree in bulk-classification mode, driven by the real selection hook. */
function BulkTree({
  tree = [organization],
  canEdit = true,
  onSetUsage,
}: {
  tree?: AssetTreeNode[];
  canEdit?: boolean;
  onSetUsage: (assetIds: string[], usage: AssetUsage | null) => void;
}) {
  const selection = useAssetSelection();
  return (
    <AssetTree
      tree={tree}
      canEdit={canEdit}
      selection={selection}
      onSetUsage={onSetUsage}
    />
  );
}

function renderBulk(props: Partial<ComponentProps<typeof BulkTree>> = {}) {
  const onSetUsage =
    vi.fn<(assetIds: string[], usage: AssetUsage | null) => void>();
  render(
    <MemoryRouter>
      <TooltipProvider>
        <BulkTree onSetUsage={onSetUsage} {...props} />
      </TooltipProvider>
    </MemoryRouter>,
  );
  return { onSetUsage };
}

const checkbox = (name: string) => screen.getByRole("checkbox", { name });

afterEach(cleanup);

describe("AssetTree zone overview", () => {
  it("groups nested zones into building and floor rows with recursive counts", () => {
    renderOverview();

    expect(
      screen.getByRole("link", { name: "Hotel Bellevue" }),
    ).toHaveAttribute("href", "/assets/building-1");
    expect(screen.getByText("1 floors")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Floor 3" })).toHaveAttribute(
      "href",
      "/assets/floor-3",
    );
    const floorSummary = screen
      .getByRole("link", { name: "Floor 3" })
      .parentElement?.querySelector("p");
    expect(floorSummary).toHaveTextContent("3 zones·2 devices");
    expect(screen.getByText("Suite 301").closest("a")).toHaveAttribute(
      "href",
      "/assets/suite-301",
    );
  });

  it("summarizes sub-zones on the pill instead of nesting them in the row", () => {
    renderOverview();

    // The pill carries the count; the names live in its hover card.
    expect(screen.getByText("1 sub-zones")).toBeInTheDocument();
    expect(screen.queryByText("Salon")).not.toBeInTheDocument();
  });

  it("reveals the sub-zones of a pill on hover", async () => {
    renderOverview();

    await userEvent.hover(screen.getByText("Suite 301"));

    const card = await screen.findByRole("tooltip");
    expect(within(card).getByText("Salon")).toBeInTheDocument();
    // Device counts are recursive, as on the floor summary.
    expect(within(card).getByText("1 devices")).toBeInTheDocument();
  });

  it("links add actions to the correct parent and suggested asset type", () => {
    renderOverview();

    expect(screen.getByRole("link", { name: "Add a floor" })).toHaveAttribute(
      "href",
      "/assets/new?parentId=building-1&type=floor",
    );
    expect(
      screen.getByRole("link", { name: "Add a zone to Floor 3" }),
    ).toHaveAttribute("href", "/assets/new?parentId=floor-3&type=room");
    expect(
      screen.getByRole("link", { name: "Add a sub-zone to Suite 301" }),
    ).toHaveAttribute("href", "/assets/new?parentId=suite-301&type=zone");
    expect(
      screen.getByRole("link", { name: "Add a building" }),
    ).toHaveAttribute("href", "/assets/new?parentId=org-1&type=building");
  });

  it("offers a sub-zone action on every zone, not only on those that have one", () => {
    renderOverview();

    expect(
      screen.getByRole("link", { name: "Add a sub-zone to Room 302" }),
    ).toHaveAttribute("href", "/assets/new?parentId=room-302&type=zone");
  });

  it("keeps detail links but hides editing controls for read-only users", () => {
    renderOverview(false);

    expect(screen.getByRole("link", { name: "Floor 3" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Add a floor" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Add a zone to Floor 3" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Add a sub-zone to Room 302" }),
    ).not.toBeInTheDocument();
  });
});

describe("AssetTree usage badges", () => {
  it("labels a classified zone with its usage and leaves an unclassified one bare", () => {
    renderOverview();

    const classified = screen.getByText("Room 302").closest("a");
    expect(classified).not.toBeNull();
    expect(within(classified!).getByText("Hotel room")).toBeInTheDocument();
    const unclassified = screen.getByText("Suite 301").closest("a");
    expect(
      within(unclassified!).queryByText("Hotel room"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Hotel room")).toHaveLength(1);
  });
});

describe("AssetTree bulk classification", () => {
  it("shows no checkboxes without a selection, nor for read-only users", () => {
    renderOverview();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    cleanup();

    renderBulk({ canEdit: false });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("ticking a floor selects every zone beneath it and sends only their ids", async () => {
    const user = userEvent.setup();
    const { onSetUsage } = renderBulk();

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    await user.click(checkbox("Select every zone of Floor 3"));

    expect(checkbox("Select every zone of Suite 301")).toBeChecked();
    expect(checkbox("Select Room 302")).toBeChecked();
    expect(checkbox("Select every zone of Hotel Bellevue")).toBeChecked();
    expect(
      screen.getByRole("region", { name: "3 zones selected" }),
    ).toBeInTheDocument();

    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "Usage" }));
    await user.click(screen.getByRole("option", { name: "Common area" }));
    await user.click(apply);

    // The floor and building ids never reach the API; the suite's sub-zone does.
    expect(onSetUsage).toHaveBeenCalledExactlyOnceWith(
      ["suite-301", "salon", "room-302"],
      "common_area",
    );
  });

  it("marks the ancestors of a partial selection as indeterminate", async () => {
    const user = userEvent.setup();
    renderBulk();

    await user.click(checkbox("Select Room 302"));

    expect(checkbox("Select every zone of Floor 3")).toBePartiallyChecked();
    expect(
      checkbox("Select every zone of Hotel Bellevue"),
    ).toBePartiallyChecked();
    expect(checkbox("Select every zone of Suite 301")).not.toBeChecked();
    expect(
      screen.getByRole("region", { name: "1 zones selected" }),
    ).toBeInTheDocument();
  });

  it("can clear the usage of the selection and drop the selection itself", async () => {
    const user = userEvent.setup();
    const { onSetUsage } = renderBulk();

    await user.click(checkbox("Select Room 302"));
    await user.click(screen.getByRole("combobox", { name: "Usage" }));
    await user.click(screen.getByRole("option", { name: "Unclassified" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onSetUsage).toHaveBeenCalledExactlyOnceWith(["room-302"], null);

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(checkbox("Select Room 302")).not.toBeChecked();
  });

  it("disables the checkbox of a floor with nothing to select", () => {
    const bare = assetNode("floor-9", "floor", "Floor 9");
    const site = assetNode("building-9", "building", "Annex", [bare]);
    renderBulk({ tree: [assetNode("org-9", "org", "Agrid", [site])] });

    expect(checkbox("Select every zone of Floor 9")).toBeDisabled();
    expect(checkbox("Select every zone of Annex")).toBeDisabled();
  });
});
