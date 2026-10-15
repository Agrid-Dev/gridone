import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import ViewsListPage from "./ViewsListPage";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  devices: vi.fn(),
  canWrite: true,
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    deviceViews: api,
    devices: { list: api.devices },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => api.canWrite,
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    "groups.equipmentCount": "{{count}} devices",
  }),
);

beforeEach(() => {
  api.canWrite = true;
  api.devices.mockResolvedValue([]);
  api.list.mockResolvedValue([
    {
      id: "comfort",
      name: "Comfort",
      description: "First floor",
      filter: {},
      group_by: ["floor", "room"],
    },
    { id: "lighting", name: "Lighting", filter: {}, group_by: ["ecs"] },
  ]);
});
afterEach(cleanup);

function setup() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/devices/views"]}>
        <ViewsListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("saved views", () => {
  it("opens shared views and shows ordered grouping keys", async () => {
    setup();
    expect(
      await screen.findByRole("link", { name: /Comfort/ }),
    ).toHaveAttribute("href", "/devices/views/comfort");
    expect(screen.getByText("floor → room")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lighting/ })).toHaveAttribute(
      "href",
      "/devices/views/lighting",
    );
  });

  it("shows viewers nothing but the tabs and the groups, including in the empty state", async () => {
    api.canWrite = false;
    api.list.mockResolvedValue([]);
    setup();
    await screen.findByText("groups.noGroups");
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/devices", "/devices/views"]);
    expect(screen.queryByText(/groups.manageHint/)).not.toBeInTheDocument();
  });

  it("sends writers to Configuration to manage groups, never creating here, and shows real member counts", async () => {
    api.list.mockResolvedValue([
      {
        id: "comfort",
        name: "Comfort",
        filter: { tags: { group: ["comfort"] } },
        group_by: [],
      },
    ]);
    api.devices.mockResolvedValue([
      { id: "a", tags: { group: ["comfort", "other"] } },
      { id: "b", tags: { group: ["other"] } },
    ]);
    setup();
    await screen.findByText("1 devices");
    const [header, hint] = screen.getAllByRole("link", {
      name: "groups.manage",
    });
    expect(header).toHaveAttribute("href", "/groups");
    expect(header).not.toHaveClass("bg-primary");
    expect(hint).toHaveAttribute("href", "/groups");
    expect(hint.parentElement).toHaveTextContent("groups.manageHint");
    expect(screen.getByRole("link", { name: /Comfort/ })).not.toHaveTextContent(
      "comfort:",
    );
    for (const link of screen.getAllByRole("link"))
      expect(link.getAttribute("href")).not.toMatch(/\/new|\/edit/);
  });

  it("points writers to Configuration from the empty state, never to a form", async () => {
    api.list.mockResolvedValue([]);
    setup();
    await screen.findByText("groups.noGroups");
    expect(
      screen
        .getAllByRole("link", { name: "groups.manage" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/groups", "/groups"]);
    expect(screen.getByText(/groups.manageHint/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /empty.create/ }),
    ).not.toBeInTheDocument();
  });
});
