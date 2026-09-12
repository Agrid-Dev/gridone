import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import GroupsListPage from "./GroupsListPage";

const api = vi.hoisted(() => ({ list: vi.fn(), canWrite: true }));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ devices: { groups: api } }),
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
  api.list.mockResolvedValue([
    {
      id: "comfort",
      name: "Comfort",
      description: "First floor",
      driver_id: "thermostat",
      device_ids: ["a", "b"],
    },
    { id: "lighting", name: "Lighting", driver_id: "dimmer", device_ids: [] },
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
      <MemoryRouter initialEntries={["/devices/groups"]}>
        <GroupsListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("group cards", () => {
  it("opens each group and searches by name, description or driver", async () => {
    setup();
    expect(
      await screen.findByRole("link", { name: /Comfort/ }),
    ).toHaveAttribute("href", "/devices/groups/comfort");
    expect(screen.getByText("2 devices")).toBeInTheDocument();
    const search = screen.getByRole("searchbox");
    for (const value of [" COMFORT ", "First floor", "thermostat"]) {
      fireEvent.change(search, { target: { value } });
      expect(screen.getByRole("link", { name: /Comfort/ })).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /Lighting/ }),
      ).not.toBeInTheDocument();
    }
    fireEvent.change(search, { target: { value: "missing" } });
    fireEvent.click(screen.getByRole("button", { name: "empty.clearFilters" }));
    expect(screen.getByRole("link", { name: /Lighting/ })).toBeInTheDocument();
  });

  it("does not offer group creation to viewers, including in the empty state", async () => {
    api.canWrite = false;
    api.list.mockResolvedValue([]);
    setup();
    await screen.findByText("empty.title");
    expect(
      screen.queryByRole("link", { name: "groups.create" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /empty.new/ }),
    ).not.toBeInTheDocument();
  });
});
