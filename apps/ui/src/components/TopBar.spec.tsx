import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import type { BuildingProfile } from "@/api/assets";

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
    yearBuilt: null,
    operator: null,
    latitude: null,
    longitude: null,
    coverUrl: null,
    icon: null,
  };
}

function renderTopBar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["building-profile"], makeProfile("Tour Mercure"));
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/devices"]}>
        <TopBar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TopBar", () => {
  it("spans the full width on top (inset-x-0, raised z-index)", () => {
    const { container } = renderTopBar();
    const header = container.querySelector("header");
    expect(header?.className).toContain("inset-x-0");
    expect(header?.className).toContain("z-50");
  });

  it("lays out building identity, notifications and account avatar", () => {
    renderTopBar();
    // Building identity as breadcrumb root.
    expect(screen.getByRole("link", { name: /Tour Mercure/ })).toHaveAttribute(
      "href",
      "/",
    );
    // Notifications.
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
    // Account avatar (circle), initials from the user name.
    const avatar = screen.getByRole("button", { name: "Léa Durand" });
    expect(avatar).toHaveTextContent("LD");
    expect(avatar.className).toContain("rounded-full");
  });

  it("renders the building name in body font, not the display font", () => {
    renderTopBar();
    const name = screen.getByText("Tour Mercure");
    expect(name.className).toContain("font-sans");
    expect(name.className).not.toContain("font-display");
  });
});
