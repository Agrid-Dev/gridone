import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "app.devices": "Devices",
    "app.automations": "Automations",
  }),
);

import { Breadcrumbs } from "./Breadcrumbs";
import { BreadcrumbProvider, useBreadcrumb } from "./BreadcrumbProvider";
import type { BreadcrumbCrumb } from "@/lib/breadcrumbTrail";
import type { BuildingProfile } from "@/api/assets";

afterEach(cleanup);

function Register({ crumbs }: { crumbs: BreadcrumbCrumb[] }) {
  useBreadcrumb(crumbs);
  return null;
}

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

function renderAt(
  pathname: string,
  {
    profileName = null,
    crumbs = [],
  }: { profileName?: string | null; crumbs?: BreadcrumbCrumb[] } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["building-profile"], makeProfile(profileName));
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[pathname]}>
        <BreadcrumbProvider>
          <Register crumbs={crumbs} />
          <Breadcrumbs />
        </BreadcrumbProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Breadcrumbs", () => {
  it("renders the building name as the root, linking to /", () => {
    renderAt("/", { profileName: "Tour Mercure" });
    expect(screen.getByRole("link", { name: /Tour Mercure/ })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows only the root on the home route", () => {
    renderAt("/", { profileName: "Tour Mercure" });
    expect(screen.queryByText("Devices")).not.toBeInTheDocument();
    expect(screen.queryByText("›")).not.toBeInTheDocument();
  });

  it("degrades to a nameless Home root linking to /devices when unconfigured", () => {
    const { container } = renderAt("/devices", { profileName: null });
    expect(screen.queryByText("Tour Mercure")).not.toBeInTheDocument();
    expect(container.querySelector("a")).toHaveAttribute("href", "/devices");
  });

  it("renders a route-registered entity name and the derived section link", () => {
    renderAt("/devices/dev-1", {
      profileName: "Tour Mercure",
      crumbs: [{ to: "/devices/dev-1", label: "RTU-3" }],
    });
    expect(screen.getByRole("link", { name: "Devices" })).toHaveAttribute(
      "href",
      "/devices",
    );
    const current = screen.getByText("RTU-3");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("shows an automation's name, not its id (regression)", () => {
    renderAt("/automations/auto-1", {
      profileName: "Tour Mercure",
      crumbs: [{ to: "/automations/auto-1", label: "Night setback" }],
    });
    expect(screen.getByText("Night setback")).toBeInTheDocument();
    expect(screen.queryByText("auto-1")).not.toBeInTheDocument();
  });

  it("renders › separators between segments", () => {
    renderAt("/devices/dev-1", {
      profileName: "Tour Mercure",
      crumbs: [{ to: "/devices/dev-1", label: "RTU-3" }],
    });
    expect(screen.getAllByText("›").length).toBeGreaterThan(0);
  });
});
