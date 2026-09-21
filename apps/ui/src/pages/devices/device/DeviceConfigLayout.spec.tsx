import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import DeviceConfigLayout from "./DeviceConfigLayout";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.configurationTabs.label": "Device configuration sections",
    "deviceDetails.configurationTabs.general": "General",
    "deviceDetails.configurationTabs.operatingRules": "Operating rules",
  }),
);
vi.mock("@/hooks/useDevice", () => ({
  useDeviceFromRoute: () => ({ id: "a" }),
}));

afterEach(cleanup);

function setup(suffix = "") {
  render(
    <MemoryRouter initialEntries={[`/devices/a/config${suffix}`]}>
      <Routes>
        <Route
          path="/devices/:deviceId/config"
          element={<DeviceConfigLayout />}
        >
          <Route index element={<h2>General configuration</h2>} />
          <Route path="edit" element={<h2>Edit configuration</h2>} />
          <Route
            path="operating-rules/*"
            element={<h2>Operating rule configuration</h2>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe("device configuration navigation", () => {
  it("opens operating rules from the configuration sub-tabs", async () => {
    const user = setup();
    const tabs = screen.getByRole("tablist", {
      name: "Device configuration sections",
    });
    expect(within(tabs).getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const operatingRules = within(tabs).getByRole("tab", {
      name: "Operating rules",
    });
    expect(operatingRules).toHaveAttribute(
      "href",
      "/devices/a/config/operating-rules",
    );
    await user.click(operatingRules);
    expect(
      await screen.findByRole("heading", {
        name: "Operating rule configuration",
      }),
    ).toBeInTheDocument();
    expect(operatingRules).toHaveAttribute("aria-selected", "true");
  });

  it.each(["/operating-rules/new", "/operating-rules/rule/edit"])(
    "keeps operating rules selected on %s",
    (suffix) => {
      setup(suffix);
      expect(
        screen.getByRole("tab", { name: "Operating rules" }),
      ).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    },
  );

  it("keeps the existing general edit page within configuration", () => {
    setup("/edit");
    expect(
      screen.getByRole("heading", { name: "Edit configuration" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
