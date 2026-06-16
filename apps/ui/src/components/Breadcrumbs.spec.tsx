import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "app.devices": "Devices",
    "app.assets": "Zones",
    "app.drivers": "Drivers",
    "breadcrumb.commands": "Commands",
    "breadcrumb.templates": "Templates",
    "breadcrumb.history": "History",
  }),
);

import { Breadcrumbs } from "./Breadcrumbs";
import type { BuildingProfile } from "@/api/assets";
import type { Device } from "@/api/devices";

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

function renderAt(
  pathname: string,
  {
    profileName = null,
    seed,
  }: { profileName?: string | null; seed?: (qc: QueryClient) => void } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["building-profile"], makeProfile(profileName));
  seed?.(queryClient);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[pathname]}>
        <Breadcrumbs />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Breadcrumbs", () => {
  it("renders the building name as the root, linking to /", () => {
    renderAt("/", { profileName: "Tour Mercure" });
    const root = screen.getByRole("link", { name: /Tour Mercure/ });
    expect(root).toHaveAttribute("href", "/");
  });

  it("shows only the root on the home route", () => {
    renderAt("/", { profileName: "Tour Mercure" });
    expect(screen.queryByText("Devices")).not.toBeInTheDocument();
    // No separators when there is no trail beyond the root.
    expect(screen.queryByText("›")).not.toBeInTheDocument();
  });

  it("degrades to a nameless Home root linking to /devices when unconfigured", () => {
    const { container } = renderAt("/devices", { profileName: null });
    expect(screen.queryByText("Tour Mercure")).not.toBeInTheDocument();
    const rootLink = container.querySelector("a");
    expect(rootLink).toHaveAttribute("href", "/devices");
  });

  it("resolves a device segment to its name from the query cache", () => {
    renderAt("/devices/dev-1", {
      profileName: "Tour Mercure",
      seed: (qc) =>
        qc.setQueryData(["device", "dev-1"], {
          id: "dev-1",
          name: "RTU-3",
        } as unknown as Device),
    });
    expect(screen.getByText("RTU-3")).toBeInTheDocument();
    // The Devices ancestor is a link; the device is the current page.
    expect(screen.getByRole("link", { name: "Devices" })).toHaveAttribute(
      "href",
      "/devices",
    );
    expect(screen.getByText("RTU-3")).toHaveAttribute("aria-current", "page");
  });

  it("falls back to the id while the entity name has not hydrated", () => {
    renderAt("/devices/dev-9", { profileName: "Tour Mercure" });
    expect(screen.getByText("dev-9")).toBeInTheDocument();
  });

  it("renders › separators between segments", () => {
    renderAt("/devices/dev-1", { profileName: "Tour Mercure" });
    expect(screen.getAllByText("›").length).toBeGreaterThan(0);
  });
});
