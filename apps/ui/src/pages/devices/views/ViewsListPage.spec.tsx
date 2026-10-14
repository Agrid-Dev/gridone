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

  it("does not offer view creation to viewers, including in the empty state", async () => {
    api.canWrite = false;
    api.list.mockResolvedValue([]);
    setup();
    await screen.findByText("groups.noGroups");
    expect(
      screen.queryByRole("link", { name: "groups.create" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /empty.new/ }),
    ).not.toBeInTheDocument();
  });

  it("makes group creation the primary action and shows real member counts", async () => {
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
    expect(screen.getByRole("link", { name: "groups.create" })).toHaveAttribute(
      "href",
      "/devices/views/new",
    );
    await screen.findByText("1 devices");
    expect(screen.getByRole("link", { name: /Comfort/ })).not.toHaveTextContent(
      "comfort:",
    );
  });
});
