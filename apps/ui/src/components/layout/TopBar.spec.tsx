import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import type { BuildingProfile, GridoneClient } from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";

vi.mock("react-i18next", () =>
  createI18nMock({
    "topbar.notifications": "Notifications",
    "settings.subtitle": "My profile",
    "auth.logout": "Log out",
    "app.devices": "Devices",
  }),
);

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: {
        name: "Léa Durand",
        username: "lea",
        email: "lea@example.com",
        role: "admin",
      },
    },
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({ page: { total: 0, items: [] } }),
}));

import { TopBar } from "./TopBar";

afterEach(cleanup);

function makeProfile(name: string | null): BuildingProfile {
  return {
    name,
    address: null,
    surface: null,
    floors: null,
    year_built: null,
    operator: null,
    latitude: null,
    longitude: null,
    cover_url: null,
    icon: null,
  };
}

function renderTopBar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const profile = makeProfile("Tour Mercure");
  queryClient.setQueryData(["building-profile"], profile);
  const fakeClient = {
    assets: { getBuildingProfile: () => Promise.resolve(profile) },
  } as unknown as GridoneClient;
  return render(
    <GridoneClientProvider client={fakeClient}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/devices"]}>
          <TopBar />
        </MemoryRouter>
      </QueryClientProvider>
    </GridoneClientProvider>,
  );
}

describe("TopBar", () => {
  it("sits beside the full-height sidebar, not above it", () => {
    const { container } = renderTopBar();
    const header = container.querySelector("header");
    expect(header?.className).toContain("left-64");
    expect(header?.className).toContain("right-0");
    expect(header?.className).not.toContain("inset-x-0");
    // z-50 is reserved for Radix portals.
    expect(header?.className).toContain("z-40");
  });

  it("lays out notifications and the account avatar", () => {
    renderTopBar();
    // Notifications.
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
    // Account avatar (circle), initials from the user name.
    const avatar = screen.getByRole("button", { name: "Léa Durand" });
    expect(avatar).toHaveTextContent("LD");
    expect(avatar.className).toContain("rounded-full");
  });

  it("no longer carries the building identity, which moved to the sidebar", () => {
    renderTopBar();
    expect(screen.queryByText("Tour Mercure")).not.toBeInTheDocument();
  });
});
