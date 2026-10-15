import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import Groups from "./index";

const mocks = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    mocks.permissions.has(permission),
}));
vi.mock("react-i18next", () =>
  createI18nMock({ "errors.forbidden": "Access denied" }),
);
vi.mock("./GroupsListPage", () => ({ default: () => <p>Groups list</p> }));
vi.mock("./ViewFormPage", () => ({ default: () => <p>Group form</p> }));

beforeEach(() => mocks.permissions.clear());
afterEach(cleanup);

function setup(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/groups/*" element={<Groups />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Configuration › Groups routes", () => {
  it.each([
    ["/groups", "Groups list"],
    ["/groups/new", "Group form"],
    ["/groups/v1/edit", "Group form"],
  ])("opens %s to a device writer", async (path, page) => {
    mocks.permissions.add("devices:write");
    setup(path);
    expect(await screen.findByText(page)).toBeInTheDocument();
  });

  it.each(["/groups", "/groups/new", "/groups/v1/edit"])(
    "refuses %s to a reader",
    (path) => {
      mocks.permissions.add("devices:read");
      setup(path);
      expect(screen.getByText("Access denied")).toBeInTheDocument();
      expect(
        screen.queryByText(/Groups list|Group form/),
      ).not.toBeInTheDocument();
    },
  );
});
