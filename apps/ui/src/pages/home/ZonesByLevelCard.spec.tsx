import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Asset } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const mocks = vi.hoisted(() => ({ canWriteAssets: true }));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    permission === "assets:write" ? mocks.canWriteAssets : true,
}));
vi.mock("@/hooks/useBuildingModel", () => ({
  useBuildingModel: () => ({ model: null, isLoading: false }),
}));
vi.mock("react-i18next", () =>
  createI18nMock({ "zonesByLevel.addZone": "Add a zone" }),
);

import { ZonesByLevelCard } from "./ZonesByLevelCard";

const site = { id: "org", name: "Site", type: "org", parent_id: null } as Asset;
const building = {
  id: "b1",
  name: "Hotel",
  type: "building",
  parent_id: "org",
} as Asset;

beforeEach(() => {
  mocks.canWriteAssets = true;
});
afterEach(cleanup);

function renderCard(assets: Asset[]) {
  render(
    <MemoryRouter>
      <ZonesByLevelCard assets={assets} devices={[]} loading={false} />
    </MemoryRouter>,
  );
}

describe("ZonesByLevelCard before any level", () => {
  it("adds a zone to the building it shows, not another building", () => {
    renderCard([site, building]);
    expect(screen.getByRole("link", { name: "Add a zone" })).toHaveAttribute(
      "href",
      "/assets/new?type=zone&parentId=b1",
    );
  });

  it("adds a zone to the site when there is no building yet", () => {
    renderCard([site]);
    expect(screen.getByRole("link", { name: "Add a zone" })).toHaveAttribute(
      "href",
      "/assets/new?type=zone",
    );
  });

  it("offers no zone to add without assets:write", () => {
    mocks.canWriteAssets = false;
    renderCard([site, building]);
    expect(
      screen.queryByRole("link", { name: "Add a zone" }),
    ).not.toBeInTheDocument();
  });
});
