import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Device, FaultView } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "app.title": "Gridone",
    "app.version": "Version {{version}}",
    "app.synoptics": "Synoptics",
    "app.devices": "Devices",
    "app.assets": "Zones",
    "app.automations": "Automations",
    "app.faults": "Faults",
    "app.drivers": "Drivers",
    "app.networks": "Networks",
    "app.apps": "Apps",
    "app.users": "Users",
    "nav.main": "Main navigation",
    "nav.supervision": "Supervision",
    "nav.configuration": "Configuration",
    "sidebar.faultsBadge": "{{count}} active faults",
    "sidebar.devicesBadge": "{{count}} devices",
    "sidebar.appRequestsBadge": "{{count}} pending registration requests",
  }),
);

const permissions: { can: (permission: string) => boolean } = {
  can: () => true,
};
const flags = { dashboards: true, synoptics: true };
let faults: FaultView[] = [];
let devices: Device[] = [];
let pendingAppRequests = 0;

const health: { version?: string } = { version: "0.3.0" };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ health }),
  usePermissions: () => (permission: string) => permissions.can(permission),
}));

vi.mock("@/utils/featureFlags", () => ({
  useFeatureEnabled: (flag: "dashboards" | "synoptics") => flags[flag],
}));

vi.mock("@/hooks/useFaultsList", () => ({
  useFaultsList: () => ({ faults, loading: false, error: null }),
}));

vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices, loading: false, error: null }),
}));

vi.mock("@/hooks/usePendingAppRequests", () => ({
  usePendingAppRequests: () => ({ pendingCount: pendingAppRequests }),
}));

let dashboards: { id: string; name: string }[] = [];
vi.mock("@/pages/dashboards/useDashboards", () => ({
  useDashboardEntries: () => ({ dashboards, ready: true }),
}));

// The building block has its own spec; stub it so this one stays about nav.
vi.mock("./BuildingSwitcher", () => ({
  BuildingSwitcher: () => <div data-testid="building-switcher" />,
}));

import { Sidebar } from "./Sidebar";

function renderSidebar(mobile = false, path = "/devices") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar mobile={mobile} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  health.version = "0.3.0";
  permissions.can = () => true;
  flags.dashboards = true;
  flags.synoptics = true;
  dashboards = [];
  faults = [];
  devices = [];
  pendingAppRequests = 0;
});
afterEach(cleanup);

describe("Sidebar", () => {
  it("groups Users under Configuration, with no Administration section", () => {
    renderSidebar();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute(
      "href",
      "/users",
    );
  });

  it("hides Users without the users:read permission", () => {
    permissions.can = (permission) => permission !== "users:read";
    renderSidebar();
    expect(
      screen.queryByRole("link", { name: "Users" }),
    ).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "hides Automations without read permission (mobile: %s)",
    (mobile) => {
      permissions.can = (permission) => permission !== "automations:read";
      renderSidebar(mobile);
      expect(
        screen.queryByRole("link", { name: "Automations" }),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps Automations visible to a read-only user", () => {
    permissions.can = (permission) => permission === "automations:read";
    renderSidebar();
    expect(screen.getByRole("link", { name: "Automations" })).toHaveAttribute(
      "href",
      "/automations",
    );
  });

  it.each([false, true])(
    "hides Zones without assets:read (mobile: %s)",
    (mobile) => {
      permissions.can = (permission) => permission !== "assets:read";
      renderSidebar(mobile);
      expect(
        screen.queryByRole("link", { name: "Zones" }),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps Zones visible to an asset reader", () => {
    permissions.can = (permission) => permission === "assets:read";
    renderSidebar();
    expect(screen.getByRole("link", { name: "Zones" })).toHaveAttribute(
      "href",
      "/assets",
    );
  });

  it.each([false, true])(
    "hides unavailable configuration links and the empty heading (mobile: %s)",
    (mobile) => {
      permissions.can = (permission) =>
        ["devices:read", "drivers:write", "transports:write"].includes(
          permission,
        );
      renderSidebar(mobile);
      for (const name of ["Drivers", "Networks", "Apps", "Users"])
        expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
      expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    },
  );

  it.each([
    ["drivers:read", "Drivers", "/drivers"],
    ["transports:read", "Networks", "/transports"],
    ["users:read", "Users", "/users"],
    ["users:write", "Apps", "/apps"],
    ["synoptics:write", "Synoptics", "/synoptics"],
  ])(
    "keeps Configuration when only %s is granted",
    (permission, name, href) => {
      permissions.can = (value) => value === permission;
      renderSidebar();
      expect(screen.getByText("Configuration")).toBeInTheDocument();
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
      for (const other of [
        "Drivers",
        "Networks",
        "Apps",
        "Users",
        "Synoptics",
      ].filter((value) => value !== name))
        expect(
          screen.queryByRole("link", { name: other }),
        ).not.toBeInTheDocument();
    },
  );

  it("puts Apps first under Configuration, above Drivers", () => {
    renderSidebar();
    const appsLink = screen.getByRole("link", { name: /Apps/ });
    expect(appsLink).toHaveAttribute("href", "/apps");
    expect(
      appsLink.compareDocumentPosition(
        screen.getByRole("link", { name: "Drivers" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("hides Apps without the users:write permission", () => {
    permissions.can = (permission) => permission !== "users:write";
    renderSidebar();
    expect(
      screen.queryByRole("link", { name: /Apps/ }),
    ).not.toBeInTheDocument();
  });

  it("badges Apps with the pending registration request count", () => {
    pendingAppRequests = 2;
    renderSidebar();
    const badge = screen.getByLabelText("2 pending registration requests");
    expect(badge).toHaveTextContent("2");
    // An app is dead until its request is accepted: this needs attention.
    expect(badge).toHaveClass("bg-destructive");
  });

  it("renders no Apps badge when no request is pending", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /Apps/ })).not.toHaveTextContent(
      "0",
    );
    expect(
      screen.queryByLabelText(/pending registration/),
    ).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "lists each dashboard first under Supervision, in order, active on its own route only (mobile: %s)",
    (mobile) => {
      dashboards = [
        { id: "d1", name: "ECS Ouest" },
        { id: "d2", name: "CTA" },
      ];
      renderSidebar(mobile, "/dashboards/d2/widgets/new");
      const first = screen.getAllByRole("link").slice(0, 2);
      expect(first.map((link) => link.textContent)).toEqual([
        "ECS Ouest",
        "CTA",
      ]);
      expect(screen.getByRole("link", { name: "CTA" })).toHaveAttribute(
        "href",
        "/dashboards/d2",
      );
      expect(screen.queryByText("Dashboards")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "CTA" })).not.toHaveAttribute(
        "aria-current",
      );
      cleanup();

      renderSidebar(mobile, "/dashboards/d2");
      expect(screen.getByRole("link", { name: "CTA" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(
        screen.getByRole("link", { name: "ECS Ouest" }),
      ).not.toHaveAttribute("aria-current");
    },
  );

  it("starts Supervision at Devices without a dashboard, or with the flag off", () => {
    dashboards = [{ id: "d1", name: "ECS Ouest" }];
    flags.dashboards = false;
    renderSidebar();
    expect(
      screen.queryByRole("link", { name: "ECS Ouest" }),
    ).not.toBeInTheDocument();
    cleanup();

    flags.dashboards = true;
    dashboards = [];
    renderSidebar();
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("Devices");
  });

  it("hides Synoptics from a reader: the entry is for authoring plates", () => {
    permissions.can = (value) => value === "synoptics:read";
    renderSidebar();
    expect(
      screen.queryByRole("link", { name: "Synoptics" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
  });

  it("hides Synoptics when the feature flag is off", () => {
    flags.synoptics = false;
    renderSidebar();
    expect(
      screen.queryByRole("link", { name: "Synoptics" }),
    ).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "places Synoptics under Configuration (mobile: %s)",
    (mobile) => {
      renderSidebar(mobile);
      const configuration = screen.getByText("Configuration");
      const synoptics = screen.getByRole("link", { name: "Synoptics" });
      expect(configuration.nextElementSibling).toBe(synoptics);
      expect(synoptics).toHaveAttribute("href", "/synoptics");
    },
  );

  it("badges the Faults link with the active fault count", () => {
    faults = [{}, {}, {}] as FaultView[];
    renderSidebar();
    expect(screen.getByLabelText("3 active faults")).toHaveTextContent("3");
  });

  it("renders no badge when there are no active faults", () => {
    renderSidebar();
    const faultsLink = screen.getByRole("link", { name: /Faults/ });
    expect(faultsLink).not.toHaveTextContent("0");
    expect(screen.queryByLabelText(/active faults/)).not.toBeInTheDocument();
  });

  it("badges the Devices link with the fleet count, neutrally styled", () => {
    devices = [{}, {}] as Device[];
    faults = [{}] as FaultView[];
    renderSidebar();
    const badge = screen.getByLabelText("2 devices");
    expect(badge).toHaveTextContent("2");
    // Inventory count, not an alarm — must not share the faults badge style.
    expect(badge).not.toHaveClass("bg-destructive");
    expect(screen.getByLabelText("1 active faults")).toHaveClass(
      "bg-destructive",
    );
  });

  it("renders no devices badge for an empty fleet", () => {
    renderSidebar();
    expect(screen.queryByLabelText(/devices/)).not.toBeInTheDocument();
  });

  it("keeps the Gridone brand in the footer, opening the docs, next to the version", () => {
    renderSidebar();
    const brand = screen.getByRole("link", { name: "Gridone" });
    expect(brand).toHaveAttribute("href", "https://docs.gridone.a-grid.com/");
    expect(brand).toHaveAttribute("target", "_blank");
    expect(brand).toHaveAttribute("rel", "noreferrer");
    const version = screen.getByLabelText("Version 0.3.0");
    expect(version).toHaveTextContent("v0.3.0");
    // One about-line: brand and version share the footer row.
    expect(brand.parentElement).toBe(version.parentElement);
  });

  it("gives the building block the header slot, above the navigation", () => {
    renderSidebar();
    const building = screen.getByTestId("building-switcher");
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(
      building.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // No brand link competes with the building for the home route.
    const homeLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/");
    expect(homeLinks).toHaveLength(0);
  });

  it("keeps the footer without a version when the API reports none", () => {
    health.version = undefined;
    renderSidebar();
    expect(screen.getByRole("link", { name: "Gridone" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Version/)).not.toBeInTheDocument();
  });

  it("labels the navigation landmark without swallowing the building block", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeInTheDocument();
    expect(nav).not.toContainElement(screen.getByTestId("building-switcher"));
  });
});
