import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { FaultView } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "app.title": "Gridone",
    "app.version": "Version {{version}}",
    "app.dashboards": "Dashboards",
    "app.devices": "Devices",
    "app.assets": "Zones",
    "app.automations": "Automations",
    "app.faults": "Faults",
    "app.drivers": "Drivers",
    "app.networks": "Networks",
    "app.users": "Users",
    "nav.main": "Main navigation",
    "nav.supervision": "Supervision",
    "nav.configuration": "Configuration",
    "sidebar.faultsBadge": "{{count}} active faults",
  }),
);

const permissions: { can: (permission: string) => boolean } = {
  can: () => true,
};
const flags = { dashboards: true };
let faults: FaultView[] = [];

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ health: { version: "0.3.0" } }),
  usePermissions: () => (permission: string) => permissions.can(permission),
}));

vi.mock("@/utils/featureFlags", () => ({
  useFeatureEnabled: (flag: "dashboards") => flags[flag],
}));

vi.mock("@/hooks/useFaultsList", () => ({
  useFaultsList: () => ({ faults, loading: false, error: null }),
}));

// The building block has its own spec; stub it so this one stays about nav.
vi.mock("./BuildingSwitcher", () => ({
  BuildingSwitcher: () => <div data-testid="building-switcher" />,
}));

import { Sidebar } from "./Sidebar";

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={["/devices"]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  permissions.can = () => true;
  flags.dashboards = true;
  faults = [];
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

  it("hides Dashboards when the feature flag is off", () => {
    flags.dashboards = false;
    renderSidebar();
    expect(
      screen.queryByRole("link", { name: "Dashboards" }),
    ).not.toBeInTheDocument();
  });

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

  it("shows the Gridone brand linking home, and the version in the footer", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: "Gridone" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByLabelText("Version 0.3.0")).toHaveTextContent("v0.3.0");
  });

  it("labels the navigation landmark without swallowing the building block", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeInTheDocument();
    expect(nav).not.toContainElement(screen.getByTestId("building-switcher"));
  });
});
