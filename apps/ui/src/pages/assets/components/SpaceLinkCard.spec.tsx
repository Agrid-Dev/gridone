import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GridoneError, type Asset, type BuildingModel } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const { mockClient, mockToast } = vi.hoisted(() => ({
  mockClient: {
    assets: {
      getModel: vi.fn(),
      update: vi.fn(),
    },
  },
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => mockClient,
}));
vi.mock("sonner", () => ({ toast: mockToast }));

vi.mock("react-i18next", () =>
  createI18nMock({
    "editPage.spaceLink.title": "3D space",
    "editPage.spaceLink.description":
      "Link this room to a space of the building's 3D model.",
    "editPage.spaceLink.empty": "This room is not linked to a 3D space yet.",
    "editPage.spaceLink.link": "Link 3D space",
    "editPage.spaceLink.unlink": "Unlink",
    "editPage.spaceLink.linked": "3D space linked.",
    "editPage.spaceLink.unlinked": "3D space unlinked.",
    "editPage.spaceLink.pickerTitle": "Select a 3D space",
    "editPage.spaceLink.searchPlaceholder": "Search spaces",
    "common:common.cancel": "Cancel",
    "common:common.noResults": "No results",
  }),
);

import { SpaceLinkCard } from "./SpaceLinkCard";

const building: Asset = {
  id: "b1",
  parent_id: "org1",
  type: "building",
  name: "HQ",
  path: ["org1", "b1"],
};
const floor: Asset = {
  id: "f1",
  parent_id: "b1",
  type: "floor",
  name: "Ground floor",
  path: ["org1", "b1", "f1"],
};

function makeRoom(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "r1",
    parent_id: "f1",
    type: "room",
    name: "Room 1",
    path: ["org1", "b1", "f1", "r1"],
    ifc_global_id: null,
    ...overrides,
  };
}

function makeModel(overrides: Partial<BuildingModel> = {}): BuildingModel {
  return {
    asset_id: "b1",
    status: "ready",
    filename: "hq.ifc",
    ifc_size: 2_000_000,
    glb_size: 500_000,
    error: null,
    storeys: [
      { global_id: "s1", name: "Level 0", elevation: 0 },
      { global_id: "s2", name: "Level 1", elevation: 3 },
    ],
    spaces: [
      {
        global_id: "sp1",
        name: "Room 001",
        storey_global_id: "s1",
        storey_name: "Level 0",
      },
      {
        global_id: "sp2",
        name: "Room 002",
        storey_global_id: "s1",
        storey_name: "Level 0",
      },
      {
        global_id: "sp3",
        name: "Office 3",
        storey_global_id: "s2",
        storey_name: "Level 1",
      },
    ],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  } as BuildingModel;
}

function renderCard({
  asset = makeRoom(),
  allAssets,
  canWrite = true,
}: {
  asset?: Asset;
  allAssets?: Asset[];
  canWrite?: boolean;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SpaceLinkCard
        asset={asset}
        allAssets={allAssets ?? [building, floor, asset]}
        canWrite={canWrite}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpaceLinkCard", () => {
  it("renders nothing when the room has no ancestor building", () => {
    const orphan = makeRoom({ parent_id: null, path: ["r1"] });
    const { container } = renderCard({ asset: orphan, allAssets: [orphan] });

    expect(container.firstChild).toBeNull();
    expect(mockClient.assets.getModel).not.toHaveBeenCalled();
  });

  it("renders nothing when the building has no 3D model", async () => {
    mockClient.assets.getModel.mockRejectedValue(
      new GridoneError(404, "Asset 'b1' has no 3D model"),
    );
    const { container } = renderCard();

    await waitFor(() =>
      expect(mockClient.assets.getModel).toHaveBeenCalledWith("b1"),
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the linked space and unlinks it", async () => {
    mockClient.assets.getModel.mockResolvedValue(makeModel());
    mockClient.assets.update.mockResolvedValue(makeRoom());
    const user = userEvent.setup();
    renderCard({ asset: makeRoom({ ifc_global_id: "sp1" }) });

    expect(await screen.findByText("Room 001")).toBeInTheDocument();
    expect(screen.getByText("Level 0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unlink" }));

    await waitFor(() =>
      expect(mockClient.assets.update).toHaveBeenCalledWith("r1", {
        ifc_global_id: null,
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith("3D space unlinked.");
  });

  it("lists only unlinked spaces, filters by search and links the selection", async () => {
    mockClient.assets.getModel.mockResolvedValue(makeModel());
    mockClient.assets.update.mockResolvedValue(
      makeRoom({ ifc_global_id: "sp3" }),
    );
    const user = userEvent.setup();
    const asset = makeRoom();
    const sibling = makeRoom({
      id: "r2",
      name: "Room 2",
      path: ["org1", "b1", "f1", "r2"],
      ifc_global_id: "sp2",
    });
    renderCard({ asset, allAssets: [building, floor, asset, sibling] });

    await user.click(
      await screen.findByRole("button", { name: "Link 3D space" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Room 001")).toBeInTheDocument();
    expect(dialog.getByText("Office 3")).toBeInTheDocument();
    // sp2 is already linked to another room asset.
    expect(dialog.queryByText("Room 002")).not.toBeInTheDocument();

    await user.type(dialog.getByPlaceholderText("Search spaces"), "Office");
    expect(dialog.queryByText("Room 001")).not.toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: /Office 3/ }));
    await user.click(dialog.getByRole("button", { name: "Link 3D space" }));

    await waitFor(() =>
      expect(mockClient.assets.update).toHaveBeenCalledWith("r1", {
        ifc_global_id: "sp3",
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith("3D space linked.");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("hides write actions for read-only users", async () => {
    mockClient.assets.getModel.mockResolvedValue(makeModel());
    renderCard({ canWrite: false });

    expect(
      await screen.findByText("This room is not linked to a 3D space yet."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Link 3D space" }),
    ).not.toBeInTheDocument();

    cleanup();
    mockClient.assets.getModel.mockResolvedValue(makeModel());
    renderCard({
      asset: makeRoom({ ifc_global_id: "sp1" }),
      canWrite: false,
    });

    expect(await screen.findByText("Room 001")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unlink" }),
    ).not.toBeInTheDocument();
  });
});
