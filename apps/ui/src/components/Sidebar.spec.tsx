import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "app.title": "Gridone",
    "app.devices": "Devices",
    "app.assets": "Zones",
    "app.drivers": "Drivers",
    "app.automations": "Automations",
    "app.faults": "Faults",
    "app.users": "Users",
    "app.version": "Version {{version}}",
  }),
);

const can = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ health: { version: "1.2.3" } }),
  usePermissions: () => can,
}));

import { Sidebar } from "./Sidebar";

afterEach(cleanup);

function renderSidebar({ admin }: { admin: boolean }) {
  can.mockReturnValue(admin);
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("lists nav entries in the agreed order, with Users last (admin)", () => {
    renderSidebar({ admin: true });
    const labels = screen
      .getAllByRole("link")
      .map((a) => a.textContent?.trim());
    expect(labels).toEqual([
      "Devices",
      "Zones",
      "Drivers",
      "Automations",
      "Faults",
      "Users",
    ]);
  });

  it("hides Users without the users:read permission", () => {
    renderSidebar({ admin: false });
    expect(
      screen.queryByRole("link", { name: "Users" }),
    ).not.toBeInTheDocument();
  });

  it("no longer renders Applications or Settings nav entries", () => {
    renderSidebar({ admin: true });
    expect(
      screen.queryByRole("link", { name: /Apps|Applications/ }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: /Settings/ })).toBeNull();
  });

  it("shows the Gridone product brand and version in the footer", () => {
    renderSidebar({ admin: true });
    expect(screen.getByText("Gridone")).toBeInTheDocument();
    expect(screen.getByText("v1.2.3")).toBeInTheDocument();
  });
});
