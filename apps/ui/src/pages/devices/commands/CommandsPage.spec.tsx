import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "commands.title": "Commands",
    "commands.newCommand": "New command",
    "commands.templates.title": "Templates",
  }),
);

const permissions: { can: (permission: string) => boolean } = {
  can: () => true,
};
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) => permissions.can(permission),
}));

vi.mock("@/hooks/useCommands", () => ({
  useCommands: ({ deviceId }: { deviceId?: string }) => ({
    deviceId,
    attributeOptions: [],
    devices: [],
    users: [],
    templates: [],
    setFilter: vi.fn(),
    isDeviceFixed: !!deviceId,
    table: null,
    data: undefined,
    isLoading: false,
    isPlaceholderData: false,
    error: null,
    prevHref: null,
    nextHref: null,
  }),
}));

// The bar and the table are exercised by their own specs; here they only need
// to render the action slot so the New command button stays observable.
vi.mock("./CommandsFilterBar", () => ({
  CommandsFilterBar: ({ actions }: { actions?: ReactNode }) => (
    <div data-testid="filter-bar">{actions}</div>
  ),
}));
vi.mock("./CommandsTable", () => ({
  CommandsTable: () => <div data-testid="commands-table" />,
}));

import CommandsPage from "./CommandsPage";

function renderPage(props: { deviceId?: string; embedded?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <CommandsPage {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  permissions.can = () => true;
});
afterEach(cleanup);

describe("CommandsPage", () => {
  it("shows its own header and a New command action when standalone", () => {
    renderPage();

    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New command" })).toHaveAttribute(
      "href",
      "/devices/commands/new",
    );
  });

  it("scopes the New command link to the device it lists", () => {
    renderPage({ deviceId: "d1" });

    expect(screen.getByRole("link", { name: "New command" })).toHaveAttribute(
      "href",
      "/devices/d1/commands/new",
    );
  });

  it("hides the New command action without devices:write", () => {
    permissions.can = (permission) => permission !== "devices:write";
    renderPage();

    expect(
      screen.queryByRole("link", { name: "New command" }),
    ).not.toBeInTheDocument();
  });

  it("drops both header and action when embedded in the device frame", () => {
    renderPage({ deviceId: "d1", embedded: true });

    expect(screen.queryByText("Commands")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "New command" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("commands-table")).toBeInTheDocument();
  });
});
