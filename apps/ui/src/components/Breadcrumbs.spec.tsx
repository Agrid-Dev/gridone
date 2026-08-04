import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

afterEach(cleanup);

function Register({ crumbs }: { crumbs: BreadcrumbCrumb[] }) {
  useBreadcrumb(crumbs);
  return null;
}

function renderAt(
  pathname: string,
  { crumbs = [] }: { crumbs?: BreadcrumbCrumb[] } = {},
) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <BreadcrumbProvider>
        <Register crumbs={crumbs} />
        <Breadcrumbs />
      </BreadcrumbProvider>
    </MemoryRouter>,
  );
}

describe("Breadcrumbs", () => {
  it("renders nothing on the home route", () => {
    const { container } = renderAt("/");
    expect(container).toBeEmptyDOMElement();
  });

  it("does not repeat the building identity, which lives in the sidebar", () => {
    renderAt("/devices/dev-1", {
      crumbs: [{ to: "/devices/dev-1", label: "RTU-3" }],
    });
    // The section is the first crumb — no org avatar, no building name link.
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/devices");
  });

  it("renders a route-registered entity name and the derived section link", () => {
    renderAt("/devices/dev-1", {
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
      crumbs: [{ to: "/automations/auto-1", label: "Night setback" }],
    });
    expect(screen.getByText("Night setback")).toBeInTheDocument();
    expect(screen.queryByText("auto-1")).not.toBeInTheDocument();
  });

  it("renders › separators between segments", () => {
    renderAt("/devices/dev-1", {
      crumbs: [{ to: "/devices/dev-1", label: "RTU-3" }],
    });
    expect(screen.getAllByText("›").length).toBeGreaterThan(0);
  });

  it("renders no leading separator before the first crumb", () => {
    renderAt("/devices", {});
    expect(screen.queryByText("›")).not.toBeInTheDocument();
  });
});
