import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import type { Device } from "@gridone/sdk";
import { DeviceTabs } from "./DeviceTabs";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.tabs.label": "Device sections",
    "deviceDetails.tabs.overview": "Overview",
    "deviceDetails.tabs.history": "History",
    "deviceDetails.tabs.commands": "Commands",
    "deviceDetails.tabs.config": "Config",
    "deviceDetails.configurationTabs.label": "Device configuration sections",
    "deviceDetails.configurationTabs.general": "General",
    "deviceDetails.configurationTabs.operatingRules": "Operating rules",
    "deviceDetails.configurationTabs.automations": "Automations",
  }),
);

function makeDevice({
  readWriteModes = ["read", "write"],
}: { readWriteModes?: string[] } = {}): Device {
  return {
    id: "d1",
    name: "RTU-3",
    type: null,
    tags: {},
    attributes: {
      value: {
        kind: "standard" as const,
        name: "value",
        data_type: "float",
        read_write_modes: readWriteModes,
        current_value: null,
        last_updated: null,
        last_changed: null,
      },
    },
    is_faulty: false,
    driver_id: "drv",
    transport_id: "tr",
    config: {},
  };
}

function renderAt(path: string, device: Device = makeDevice()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DeviceTabs device={device} />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

afterEach(cleanup);

describe("DeviceTabs", () => {
  describe("supervision", () => {
    it("shows Overview, History and Commands with correct routes", () => {
      renderAt("/devices/d1");

      const tabs = screen.getByRole("tablist", { name: "Device sections" });
      expect(within(tabs).getAllByRole("tab")).toHaveLength(3);
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
        "href",
        "/devices/d1",
      );
      expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute(
        "href",
        "/devices/d1/history",
      );
      expect(screen.getByRole("tab", { name: "Commands" })).toHaveAttribute(
        "href",
        "/devices/d1/commands",
      );
    });

    it("offers configuration as a button beside the tabs, not as a tab", () => {
      renderAt("/devices/d1");

      expect(
        screen.queryByRole("tab", { name: "Config" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Config" })).toHaveAttribute(
        "href",
        "/devices/d1/config",
      );
    });

    it("keeps Commands as a normal tab for a read-only device (panel handles the empty state)", () => {
      renderAt("/devices/d1", makeDevice({ readWriteModes: ["read"] }));

      expect(screen.getByRole("tab", { name: "Commands" })).toHaveAttribute(
        "href",
        "/devices/d1/commands",
      );
    });

    it("marks Overview active only on the index route", () => {
      renderAt("/devices/d1");

      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("tab", { name: "History" })).not.toHaveAttribute(
        "aria-current",
      );
    });

    it("marks History active on a history sub-route", () => {
      renderAt("/devices/d1/history/chart");

      expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("tab", { name: "Overview" })).not.toHaveAttribute(
        "aria-current",
      );
    });
  });

  describe("configuration", () => {
    it("replaces the supervision tabs with the configuration sections", () => {
      renderAt("/devices/d1/config");

      const tabs = screen.getByRole("tablist", {
        name: "Device configuration sections",
      });
      expect(within(tabs).getAllByRole("tab")).toHaveLength(3);
      expect(
        within(tabs).getByRole("tab", { name: "General" }),
      ).toHaveAttribute("href", "/devices/d1/config");
      expect(
        within(tabs).getByRole("tab", { name: "Operating rules" }),
      ).toHaveAttribute("href", "/devices/d1/config/operating-rules");
      expect(
        within(tabs).getByRole("tab", { name: "Automations" }),
      ).toHaveAttribute("href", "/devices/d1/config/automations");
      expect(
        screen.queryByRole("tablist", { name: "Device sections" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: "History" }),
      ).not.toBeInTheDocument();
    });

    it("leads back to supervision from the button beside the tabs", () => {
      renderAt("/devices/d1/config/operating-rules");

      const back = screen.getByRole("link", { name: "Overview" });
      expect(back).toHaveAttribute("href", "/devices/d1");
      expect(back).not.toHaveAttribute("aria-current");
      expect(
        screen.queryByRole("link", { name: "Config" }),
      ).not.toBeInTheDocument();
    });

    it.each([
      ["/config", "General"],
      ["/config/edit", "General"],
      ["/config/operating-rules", "Operating rules"],
      ["/config/operating-rules/new", "Operating rules"],
      ["/config/operating-rules/rule/edit", "Operating rules"],
      ["/config/automations", "Automations"],
    ])("selects the right section on %s", (suffix, selected) => {
      renderAt(`/devices/d1${suffix}`);

      expect(screen.getByRole("tab", { name: selected })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      const others = screen
        .getAllByRole("tab")
        .filter((tab) => tab.textContent !== selected);
      expect(others).toHaveLength(2);
      for (const tab of others) {
        expect(tab).toHaveAttribute("aria-selected", "false");
        // General's path prefixes its siblings': without `end` its link
        // would also claim to be the current page.
        expect(tab).not.toHaveAttribute("aria-current");
      }
    });
  });

  it("switches the row between the two modes", async () => {
    const user = renderAt("/devices/d1/history");

    await user.click(screen.getByRole("link", { name: "Config" }));
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "Operating rules" }));
    expect(
      screen.getByRole("tab", { name: "Operating rules" }),
    ).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "Automations" }));
    expect(screen.getByRole("tab", { name: "Automations" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("link", { name: "Overview" }));
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
