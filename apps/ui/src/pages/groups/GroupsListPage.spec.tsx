import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import GroupsListPage from "./GroupsListPage";

const api = vi.hoisted(() => ({ list: vi.fn(), devices: vi.fn() }));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    deviceViews: api,
    devices: { list: api.devices },
  }),
}));
vi.mock("react-i18next", () =>
  createI18nMock({ "groups.equipmentCount": "{{count}} devices" }),
);

beforeEach(() => {
  api.devices.mockResolvedValue([{ id: "a", tags: { group: ["comfort"] } }]);
  api.list.mockResolvedValue([
    {
      id: "comfort",
      name: "Comfort",
      filter: { tags: { group: ["comfort"] } },
      group_by: [],
    },
    { id: "building", name: "Building", filter: {}, group_by: ["floor"] },
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
      <MemoryRouter initialEntries={["/groups"]}>
        <ResourceBoundary resetKeys={["/groups"]}>
          <GroupsListPage />
        </ResourceBoundary>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Configuration › Groups list", () => {
  it("opens every group and view on its edit page, with member counts", async () => {
    setup();
    expect(
      await screen.findByRole("link", { name: /Comfort/ }),
    ).toHaveAttribute("href", "/groups/comfort/edit");
    expect(screen.getByRole("link", { name: /Building/ })).toHaveAttribute(
      "href",
      "/groups/building/edit",
    );
    expect(await screen.findByText("1 devices")).toBeInTheDocument();
    expect(screen.getByText("groups.configurationCaption")).toBeInTheDocument();
  });

  it("creates a group from the header", () => {
    setup();
    expect(screen.getByRole("link", { name: "groups.create" })).toHaveAttribute(
      "href",
      "/groups/new",
    );
  });

  it("offers to create the first group from the empty state", async () => {
    api.list.mockResolvedValue([]);
    setup();
    expect(
      await screen.findByRole("link", { name: /common:empty.create.views/ }),
    ).toHaveAttribute("href", "/groups/new");
  });
});

it.each(["list", "devices"] as const)(
  "shows a resource error when %s fails, never an empty list",
  async (method) => {
    api[method].mockRejectedValue(new Error("unavailable"));
    setup();
    expect(await screen.findByText("errors.default")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /common:empty.create/ }),
    ).not.toBeInTheDocument();
  },
);
