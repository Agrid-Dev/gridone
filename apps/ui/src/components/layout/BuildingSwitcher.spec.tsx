import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { BuildingProfile } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "sidebar.building.actions": "Building actions",
    "sidebar.building.view": "View building",
    "sidebar.building.edit": "Edit profile",
    "sidebar.building.unnamed": "My building",
    "sidebar.building.floors": "{{count}} floors",
  }),
);

const permissions: { can: (permission: string) => boolean } = {
  can: () => true,
};
let profile: Partial<BuildingProfile> | undefined;

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) => permissions.can(permission),
}));

vi.mock("@/hooks/useBuildingProfile", () => ({
  useBuildingProfile: () => ({ data: profile }),
}));

import { BuildingSwitcher } from "./BuildingSwitcher";

function renderSwitcher() {
  return render(
    <MemoryRouter initialEntries={["/devices"]}>
      <BuildingSwitcher />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  permissions.can = () => true;
  profile = {
    name: "Hôtel Bellevue",
    address: "Paris 11e",
    floors: 7,
    icon: "hotel",
  };
});
afterEach(cleanup);

describe("BuildingSwitcher", () => {
  it("shows the building name and an address · floors summary", () => {
    renderSwitcher();
    expect(screen.getByText("Hôtel Bellevue")).toBeInTheDocument();
    expect(screen.getByText("Paris 11e · 7 floors")).toBeInTheDocument();
  });

  it("falls back to a placeholder name when the profile is unconfigured", () => {
    profile = undefined;
    renderSwitcher();
    expect(screen.getByText("My building")).toBeInTheDocument();
  });

  it("omits the details line when the profile carries neither address nor floors", () => {
    profile = { name: "Hôtel Bellevue" };
    renderSwitcher();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("offers both actions to a user who can edit assets", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole("button", { name: "Building actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "View building" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Edit profile" }),
    ).toBeInTheDocument();
  });

  it("hides the edit action without assets:write", async () => {
    permissions.can = (permission) => permission !== "assets:write";
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole("button", { name: "Building actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "View building" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Edit profile" }),
    ).not.toBeInTheDocument();
  });
});
