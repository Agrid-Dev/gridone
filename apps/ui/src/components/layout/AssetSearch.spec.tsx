import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { Asset } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "topbar.search.label": "Search a zone",
    "topbar.search.placeholder": "Search a zone…",
    "topbar.search.description": "Search and open a zone in the building.",
    "topbar.search.empty": "No zone found",
    "topbar.search.loading": "Loading zones…",
  }),
);

function asset(id: string, name: string, path: string[]): Asset {
  return {
    id,
    parent_id: null,
    type: "zone",
    name,
    path,
    position: 0,
  } as Asset;
}

const building = asset("b1", "Building A", ["b1"]);
const room = asset("r1", "Suite 701", ["b1", "r1"]);

type AssetTreeResult = {
  assetsList: Asset[];
  assetsById: Record<string, Asset>;
  assetTree: never[];
  isLoading: boolean;
};

const useAssetTree = vi.fn(
  (): AssetTreeResult => ({
    assetsList: [building, room],
    assetsById: { b1: building, r1: room },
    assetTree: [],
    isLoading: false,
  }),
);

vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => useAssetTree(),
}));

import { AssetSearch } from "./AssetSearch";

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="pathname">{pathname}</div>;
}

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={["/drivers"]}>
      <AssetSearch />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => useAssetTree.mockClear());
afterEach(cleanup);

describe("AssetSearch", () => {
  it("renders a button dressed as an input, not an editable field", () => {
    renderSearch();
    const trigger = screen.getByRole("button", { name: "Search a zone" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveTextContent("Search a zone…");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  // Guards the lazy-mount decision: the asset tree is the heaviest read in the
  // app and the topbar is on every route.
  it("does not fetch the asset tree before the palette is opened", () => {
    renderSearch();
    expect(useAssetTree).not.toHaveBeenCalled();
  });

  it("opens the palette on click and then queries the tree", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Search a zone" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(useAssetTree).toHaveBeenCalled();
  });

  it("opens on Meta+K", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens on Control+K", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("labels the dialog for assistive tech", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Search a zone" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(
      "Search a zone",
    );
  });

  it("lists a zone with its ancestor path", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Search a zone" }));
    const option = await screen.findByRole("option", { name: /Suite 701/ });
    expect(option).toHaveTextContent("Suite 701");
    expect(option).toHaveTextContent("Building A");
  });

  it("navigates to the zone on selection", async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Search a zone" }));
    await user.click(await screen.findByRole("option", { name: /Suite 701/ }));
    expect(screen.getByTestId("pathname")).toHaveTextContent("/assets/r1");
  });

  it("says it is loading rather than reporting no results", async () => {
    useAssetTree.mockReturnValue({
      assetsList: [],
      assetsById: {},
      assetTree: [],
      isLoading: true,
    });
    const user = userEvent.setup();
    renderSearch();
    await user.click(screen.getByRole("button", { name: "Search a zone" }));
    expect(await screen.findByText("Loading zones…")).toBeInTheDocument();
    expect(screen.queryByText("No zone found")).not.toBeInTheDocument();
  });
});
