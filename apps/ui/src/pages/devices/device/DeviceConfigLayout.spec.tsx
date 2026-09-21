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
    "deviceDetails.configurationTabs.protections": "Protections",
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
            path="protections/*"
            element={<h2>Protection configuration</h2>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe("device configuration navigation", () => {
  it("opens protections from the configuration sub-tabs", async () => {
    const user = setup();
    const tabs = screen.getByRole("tablist", {
      name: "Device configuration sections",
    });
    expect(within(tabs).getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const protections = within(tabs).getByRole("tab", { name: "Protections" });
    expect(protections).toHaveAttribute(
      "href",
      "/devices/a/config/protections",
    );
    await user.click(protections);
    expect(
      await screen.findByRole("heading", { name: "Protection configuration" }),
    ).toBeInTheDocument();
    expect(protections).toHaveAttribute("aria-selected", "true");
  });

  it.each(["/protections/new", "/protections/rule/edit"])(
    "keeps protections selected on %s",
    (suffix) => {
      setup(suffix);
      expect(screen.getByRole("tab", { name: "Protections" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
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
