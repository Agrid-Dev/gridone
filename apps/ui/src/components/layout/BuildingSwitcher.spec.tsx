import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { BuildingProfile } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "sidebar.building.unnamed": "My building",
    "sidebar.building.floors": "{{count}} floors",
  }),
);

let profile: Partial<BuildingProfile> | undefined;

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

  it("links straight to the building page instead of opening a menu", () => {
    renderSwitcher();
    expect(
      screen.getByRole("link", { name: /Hôtel Bellevue/ }),
    ).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
