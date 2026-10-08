import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Device, FaultView } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "app.title": "Gridone",
    "app.version": "Version {{version}}",
    "app.dashboards": "Dashboards",
    "app.synoptics": "Synoptics",
    "app.devices": "Devices",
    "app.assets": "Zones",
    "app.automations": "Automations",
    "app.faults": "Faults",
    "app.drivers": "Drivers",
    "app.networks": "Networks",
    "app.apps": "Apps",
    "app.users": "Users",
    "app.building": "Building",
    "nav.main": "Main navigation",
    "nav.configuration": "Configuration",
    "nav.backToSupervision": "Back to supervision",
    "nav.groups.operations": "Operations",
    "nav.groups.integration": "Integration",
    "nav.groups.organization": "Organization",
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

type Entry = { id: string; name: string; icon?: string | null };
type Item =
  | (Entry & { kind: "dashboard" })
  | {
      kind: "group";
      id: string;
      label: string;
      icon?: string | null;
      dashboards: Entry[];
    }
  | { kind: "section"; id: string; label: string; items: Item[] };
let dashboards: Entry[] = [];
let items: Item[] | null = null;
vi.mock("@/pages/dashboards/useDashboards", () => ({
  useDashboardStructureEntries: () => ({
    structure: {
      items: items ?? dashboards.map((d) => ({ ...d, kind: "dashboard" })),
    },
    ready: true,
  }),
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

/** Any configuration route swaps the sidebar to the configuration entries. */
const CONFIGURATION_PATH = "/users";

const CONFIGURATION_LINKS = [
  "Dashboards",
  "Synoptics",
  "Automations",
  "Apps",
  "Drivers",
  "Networks",
  "Building",
  "Users",
];

beforeEach(() => {
  health.version = "0.3.0";
  permissions.can = () => true;
  flags.dashboards = true;
  flags.synoptics = true;
  dashboards = [];
  items = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  faults = [];
  devices = [];
  pendingAppRequests = 0;
});
afterEach(cleanup);

describe("Sidebar", () => {
  describe("supervision", () => {
    it("pins a single Configuration entry under the supervision entries, opening the first configuration page", () => {
      renderSidebar();
      const entry = screen.getByRole("link", { name: "Configuration" });
      expect(entry).toHaveAttribute("href", "/dashboards/manage");
      expect(
        screen
          .getByRole("link", { name: "Faults" })
          .compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      for (const name of CONFIGURATION_LINKS)
        expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    });

    it.each([false, true])(
      "leaves the Configuration entry out when no configuration page is open to the user (mobile: %s)",
      (mobile) => {
        permissions.can = (permission) =>
          ["devices:read", "drivers:write", "transports:write"].includes(
            permission,
          );
        renderSidebar(mobile);
        expect(
          screen.queryByRole("link", { name: /Configuration/ }),
        ).not.toBeInTheDocument();
      },
    );

    it.each([
      ["dashboards:write", "Dashboards", "/dashboards/manage"],
      ["synoptics:write", "Synoptics", "/synoptics"],
      ["automations:read", "Automations", "/automations"],
      ["users:write", "Apps", "/apps"],
      ["drivers:read", "Drivers", "/drivers"],
      ["transports:read", "Networks", "/transports"],
      ["assets:write", "Building", "/profile/edit"],
      ["users:read", "Users", "/users"],
    ])(
      "opens Configuration on the only page %s grants, and lists that page alone",
      (permission, name, href) => {
        permissions.can = (value) => value === permission;
        renderSidebar();
        expect(
          screen.getByRole("link", { name: /Configuration/ }),
        ).toHaveAttribute("href", href);
        cleanup();

        renderSidebar(false, href);
        expect(screen.getByRole("link", { name })).toHaveAttribute(
          "href",
          href,
        );
        for (const other of CONFIGURATION_LINKS.filter(
          (value) => value !== name,
        ))
          expect(
            screen.queryByRole("link", { name: other }),
          ).not.toBeInTheDocument();
      },
    );

    it("badges the Configuration entry with the pending registration requests", () => {
      pendingAppRequests = 2;
      renderSidebar();
      const badge = screen.getByLabelText("2 pending registration requests");
      expect(badge).toHaveTextContent("2");
      expect(badge).toHaveClass("bg-destructive");
      expect(
        screen.getByRole("link", { name: /Configuration/ }),
      ).toContainElement(badge);
    });

    it.each([false, true])(
      "heads the dashboards with the only group label and closes them with a rule, before Devices (mobile: %s)",
      (mobile) => {
        dashboards = [
          { id: "d1", name: "ECS Ouest" },
          { id: "d2", name: "CTA" },
        ];
        renderSidebar(mobile, "/dashboards/d2/widgets/new");
        const nav = screen.getByRole("navigation", { name: "Main navigation" });
        const labels = nav.querySelectorAll("p");
        expect(Array.from(labels, (label) => label.textContent)).toEqual([
          "Dashboards",
        ]);
        const first = screen.getAllByRole("link").slice(0, 3);
        expect(first.map((link) => link.textContent)).toEqual([
          "ECS Ouest",
          "CTA",
          "Devices",
        ]);
        const rule = nav.querySelector("[aria-hidden] > .bg-border");
        expect(rule).not.toBeNull();
        expect(
          screen
            .getByRole("link", { name: "CTA" })
            .compareDocumentPosition(rule!) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
          rule!.compareDocumentPosition(
            screen.getByRole("link", { name: "Devices" }),
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      },
    );

    it.each([false, true])(
      "lights a dashboard on its own route only (mobile: %s)",
      (mobile) => {
        dashboards = [
          { id: "d1", name: "ECS Ouest" },
          { id: "d2", name: "CTA" },
        ];
        renderSidebar(mobile, "/dashboards/d2/widgets/new");
        expect(screen.getByRole("link", { name: "CTA" })).toHaveAttribute(
          "href",
          "/dashboards/d2",
        );
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

    it("draws an entry's icon, and nothing for an entry without one", () => {
      dashboards = [
        { id: "d1", name: "ECS Ouest", icon: "droplets" },
        { id: "d2", name: "CTA", icon: null },
      ];
      renderSidebar();
      expect(
        screen.getByRole("link", { name: "ECS Ouest" }).querySelector("svg"),
      ).toHaveClass("lucide-droplets");
      expect(
        screen.getByRole("link", { name: "CTA" }).querySelector("svg"),
      ).toBeNull();
    });

    it("lists a group as one entry opening its first tab, lit on any of them, and skips an empty one", () => {
      items = [
        {
          kind: "group",
          id: "g1",
          label: "ECS",
          icon: "droplets",
          dashboards: [
            { id: "d1", name: "ECS Ouest" },
            { id: "d2", name: "ECS Est" },
          ],
        },
        { kind: "group", id: "g2", label: "Vide", dashboards: [] },
      ];
      renderSidebar(false, "/dashboards/d2");
      const group = screen.getByRole("link", { name: "ECS" });
      expect(group).toHaveAttribute("href", "/dashboards/d1");
      expect(group).toHaveAttribute("aria-current", "page");
      expect(group.querySelector("svg")).toHaveClass("lucide-droplets");
      expect(screen.queryByText("ECS Ouest")).not.toBeInTheDocument();
      expect(screen.queryByText("Vide")).not.toBeInTheDocument();
    });

    it("folds a section under a heading that remembers being collapsed, but stays open on the viewed dashboard", async () => {
      items = [
        {
          kind: "section",
          id: "s1",
          label: "CVC",
          items: [
            { kind: "dashboard", id: "d1", name: "CTA" },
            {
              kind: "group",
              id: "g1",
              label: "ECS",
              dashboards: [{ id: "d2", name: "ECS Ouest" }],
            },
          ],
        },
        { kind: "dashboard", id: "d3", name: "Fuites" },
      ];
      renderSidebar(false, "/devices");
      const heading = screen.getByRole("button", { name: /CVC/ });
      expect(heading).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("link", { name: "CTA" })).toBeInTheDocument();

      await userEvent.click(heading);
      expect(heading).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByRole("link", { name: "CTA" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Fuites" })).toBeInTheDocument();
      cleanup();

      // Remembered across renders; forced open while it holds the active one.
      renderSidebar(false, "/devices");
      expect(screen.getByRole("button", { name: /CVC/ })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      cleanup();
      renderSidebar(false, "/dashboards/d2");
      expect(screen.getByRole("button", { name: /CVC/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByRole("link", { name: "ECS" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("starts at Devices, without the dashboards heading, when no dashboard is listed or the flag is off", () => {
      dashboards = [{ id: "d1", name: "ECS Ouest" }];
      flags.dashboards = false;
      renderSidebar();
      expect(
        screen.queryByRole("link", { name: "ECS Ouest" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Dashboards")).not.toBeInTheDocument();
      cleanup();

      flags.dashboards = true;
      dashboards = [];
      items = [{ kind: "group", id: "g1", label: "Vide", dashboards: [] }];
      renderSidebar();
      expect(screen.getAllByRole("link")[0]).toHaveTextContent("Devices");
      expect(screen.queryByText("Dashboards")).not.toBeInTheDocument();
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
  });

  describe("configuration", () => {
    it.each([
      "/dashboards/manage",
      "/synoptics/p1/edit",
      "/automations/a1",
      "/apps",
      "/drivers/d1",
      "/transports/new",
      "/profile/edit",
      "/users",
    ])(
      "swaps the supervision entries for the configuration ones on %s, with no title",
      (path) => {
        dashboards = [{ id: "d1", name: "ECS Ouest" }];
        renderSidebar(false, path);
        for (const name of ["ECS Ouest", "Devices", "Faults"])
          expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
        expect(
          screen.getByRole("link", { name: "Back to supervision" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("link", { name: "Drivers" }),
        ).toBeInTheDocument();
        expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
      },
    );

    it.each([
      "/dashboards/d1",
      "/dashboards/d1/widgets/new",
      // A dashboard whose id merely starts like the management page.
      "/dashboards/managed",
      "/devices/d1",
    ])("keeps supervision on %s", (path) => {
      renderSidebar(false, path);
      expect(screen.getByRole("link", { name: "Devices" })).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Back to supervision" }),
      ).not.toBeInTheDocument();
    });

    it("goes in through the Configuration entry and back to the supervision page it left", async () => {
      render(
        <MemoryRouter initialEntries={["/assets?floor=2"]}>
          <Sidebar />
        </MemoryRouter>,
      );
      await userEvent.click(
        screen.getByRole("link", { name: /Configuration/ }),
      );
      const back = screen.getByRole("link", { name: "Back to supervision" });
      expect(back).toHaveAttribute("href", "/assets?floor=2");
      expect(screen.getByRole("link", { name: "Dashboards" })).toHaveAttribute(
        "aria-current",
        "page",
      );

      await userEvent.click(back);
      expect(screen.getByRole("link", { name: "Zones" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("leads back home when this tab has visited no supervision page", () => {
      renderSidebar(false, "/drivers");
      expect(
        screen.getByRole("link", { name: "Back to supervision" }),
      ).toHaveAttribute("href", "/");
    });

    it("refuses a stored way back that leaves the app", () => {
      window.sessionStorage.setItem(
        "gridone.sidebar.lastSupervision",
        "//evil.example/x",
      );
      renderSidebar(false, "/drivers");
      expect(
        screen.getByRole("link", { name: "Back to supervision" }),
      ).toHaveAttribute("href", "/");
    });

    it.each([false, true])(
      "groups the pages under Operations, Integration and Organization (mobile: %s)",
      (mobile) => {
        renderSidebar(mobile, CONFIGURATION_PATH);
        const operations = screen.getByText("Operations");
        const dashboardsLink = screen.getByRole("link", {
          name: "Dashboards",
        });
        expect(operations.nextElementSibling).toBe(dashboardsLink);
        expect(dashboardsLink.nextElementSibling).toBe(
          screen.getByRole("link", { name: "Synoptics" }),
        );
        expect(screen.getByText("Integration").nextElementSibling).toBe(
          screen.getByRole("link", { name: /Apps/ }),
        );
        expect(screen.getByText("Organization").nextElementSibling).toBe(
          screen.getByRole("link", { name: "Building" }),
        );
        expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute(
          "href",
          "/users",
        );
        expect(screen.queryByText("Administration")).not.toBeInTheDocument();
      },
    );

    it("leaves out a group with no page open to the user", () => {
      permissions.can = (permission) => permission === "drivers:read";
      renderSidebar(false, "/drivers");
      expect(screen.getByText("Integration")).toBeInTheDocument();
      expect(screen.queryByText("Operations")).not.toBeInTheDocument();
      expect(screen.queryByText("Organization")).not.toBeInTheDocument();
    });

    it("hides Users without the users:read permission", () => {
      permissions.can = (permission) => permission !== "users:read";
      renderSidebar(false, CONFIGURATION_PATH);
      expect(
        screen.queryByRole("link", { name: "Users" }),
      ).not.toBeInTheDocument();
    });

    it.each([false, true])(
      "hides Automations without read permission (mobile: %s)",
      (mobile) => {
        permissions.can = (permission) => permission !== "automations:read";
        renderSidebar(mobile, CONFIGURATION_PATH);
        expect(
          screen.queryByRole("link", { name: "Automations" }),
        ).not.toBeInTheDocument();
      },
    );

    it("hides Building without assets:write, the home page's gate", () => {
      permissions.can = (permission) => permission !== "assets:write";
      renderSidebar(false, CONFIGURATION_PATH);
      expect(
        screen.queryByRole("link", { name: "Building" }),
      ).not.toBeInTheDocument();
    });

    it("puts Apps first under Integration, above Drivers", () => {
      renderSidebar(false, CONFIGURATION_PATH);
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
      renderSidebar(false, CONFIGURATION_PATH);
      expect(
        screen.queryByRole("link", { name: /Apps/ }),
      ).not.toBeInTheDocument();
    });

    it("badges Apps with the pending registration request count", () => {
      pendingAppRequests = 2;
      renderSidebar(false, CONFIGURATION_PATH);
      const badge = screen.getByLabelText("2 pending registration requests");
      expect(badge).toHaveTextContent("2");
      // An app is dead until its request is accepted: this needs attention.
      expect(badge).toHaveClass("bg-destructive");
      expect(screen.getByRole("link", { name: /Apps/ })).toContainElement(
        badge,
      );
    });

    it("renders no Apps badge when no request is pending", () => {
      renderSidebar(false, CONFIGURATION_PATH);
      expect(screen.getByRole("link", { name: /Apps/ })).not.toHaveTextContent(
        "0",
      );
      expect(
        screen.queryByLabelText(/pending registration/),
      ).not.toBeInTheDocument();
    });

    it("hides Synoptics from a reader: the entry is for authoring plates", () => {
      permissions.can = (value) => value === "synoptics:read";
      renderSidebar(false, CONFIGURATION_PATH);
      expect(
        screen.queryByRole("link", { name: "Synoptics" }),
      ).not.toBeInTheDocument();
    });

    it("hides Synoptics when the feature flag is off", () => {
      flags.synoptics = false;
      renderSidebar(false, CONFIGURATION_PATH);
      expect(
        screen.queryByRole("link", { name: "Synoptics" }),
      ).not.toBeInTheDocument();
    });

    it("hides the Dashboards entry from a reader, and with the flag off", () => {
      permissions.can = (value) => value === "dashboards:read";
      renderSidebar(false, CONFIGURATION_PATH);
      expect(
        screen.queryByRole("link", { name: "Dashboards" }),
      ).not.toBeInTheDocument();
      cleanup();

      permissions.can = () => true;
      flags.dashboards = false;
      renderSidebar(false, CONFIGURATION_PATH);
      expect(
        screen.queryByRole("link", { name: "Dashboards" }),
      ).not.toBeInTheDocument();
    });
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
