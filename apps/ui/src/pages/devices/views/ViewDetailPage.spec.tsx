import { clearNavigation } from "@/lib/navigation";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import ViewDetailPage from "./ViewDetailPage";
const api = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  canWrite: true,
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    deviceViews: api,
    devices: { list: api.list },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => api.canWrite,
}));
vi.mock("react-i18next", () =>
  createI18nMock({ "views.untagged": "Without {{key}}: {{count}}" }),
);
vi.mock("../commands/presenters/TargetPresenter", () => ({
  TargetPresenter: () => null,
}));
vi.mock("./TagGroupControls", () => ({
  TagGroupControls: ({
    driverId,
    filter,
    devices,
  }: {
    driverId: string;
    filter: unknown;
    devices: { id: string }[];
  }) => (
    <output data-testid={`driver-${driverId}`}>
      {JSON.stringify({ filter, ids: devices.map((d) => d.id) })}
    </output>
  ),
}));
beforeEach(() => {
  clearNavigation();
  vi.clearAllMocks();
  api.canWrite = true;
  api.get.mockResolvedValue({
    id: "building",
    name: "Building",
    filter: {},
    group_by: ["floor", "room"],
  });
  api.list.mockResolvedValue([
    {
      id: "a",
      name: "Room A",
      driver_id: "thermostat",
      tags: { floor: ["2", "3"], room: ["204"] },
    },
    {
      id: "b",
      name: "Room B",
      driver_id: "thermostat",
      tags: { floor: ["2"], room: ["205"] },
    },
    { id: "c", name: "Meter", driver_id: "meter", tags: { floor: ["2"] } },
    { id: "d", name: "Unassigned", driver_id: "meter", tags: {} },
  ]);
});
afterEach(cleanup);
function setup(path = "/devices/views/building") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/devices/views/:viewId" element={<ViewDetailPage />} />
          <Route path="/devices/views" element={<p>All views</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe("tag drilldown", () => {
  it("counts distinct members, keeps untagged devices visible, and scopes controls by driver", async () => {
    setup();
    const floor = await screen.findByRole("button", { name: "floor:2 (3)" });
    expect(
      screen.getByRole("button", { name: "floor:3 (1)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Without floor: 1")).toBeInTheDocument();
    fireEvent.click(floor);
    expect(
      await screen.findByRole("button", { name: "room:204 (1)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Without room: 1")).toBeInTheDocument();
    expect(
      JSON.parse(screen.getByTestId("driver-thermostat").textContent!),
    ).toEqual({
      filter: { tags: { floor: ["2"] }, driver_id: "thermostat" },
      ids: ["a", "b"],
    });
    fireEvent.click(screen.getByRole("button", { name: "room:204 (1)" }));
    expect(screen.queryByTestId("driver-meter")).not.toBeInTheDocument();
    expect(
      JSON.parse(screen.getByTestId("driver-thermostat").textContent!).filter
        .tags,
    ).toEqual({ floor: ["2"], room: ["204"] });
  });
  it("cannot widen a saved criterion through a manually changed URL", async () => {
    api.get.mockResolvedValue({
      id: "building",
      name: "Building",
      filter: { tags: { floor: ["2"] } },
      group_by: ["floor"],
    });
    setup("/devices/views/building?value=3");
    await screen.findByText("views.empty");
    expect(screen.queryByTestId("driver-thermostat")).not.toBeInTheDocument();
  });
  it("opens a manually selected group directly on its controls, without tag navigation", async () => {
    api.get.mockResolvedValue({
      id: "building",
      name: "Comfort",
      filter: { tags: { group: ["comfort"] } },
      group_by: [],
    });
    api.list.mockResolvedValue([
      {
        id: "a",
        name: "Thermostat",
        driver_id: "thermostat",
        tags: { group: ["comfort"] },
      },
    ]);
    setup();
    await screen.findByTestId("driver-thermostat");
    expect(
      screen.queryByRole("navigation", { name: "views.path" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "groups.editInConfiguration" }),
    ).toHaveAttribute("href", "/groups/building/edit");
    expect(
      JSON.parse(screen.getByTestId("driver-thermostat").textContent!).filter
        .tags,
    ).toEqual({ group: ["comfort"] });
  });

  it("edits groups and views in Configuration only, and never deletes here", async () => {
    setup();
    expect(
      await screen.findByRole("link", { name: "groups.editInConfiguration" }),
    ).toHaveAttribute("href", "/groups/building/edit");
    expect(
      screen.queryByRole("button", { name: "common.delete" }),
    ).not.toBeInTheDocument();
  });

  it("sends an empty group to Configuration to choose its devices", async () => {
    api.get.mockResolvedValue({
      id: "building",
      name: "Comfort",
      filter: { tags: { group: ["comfort"] } },
      group_by: [],
    });
    api.list.mockResolvedValue([]);
    setup();
    await screen.findByText("groups.empty");
    expect(
      screen
        .getAllByRole("link", { name: "groups.editInConfiguration" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/groups/building/edit", "/groups/building/edit"]);
  });

  it("offers viewers no way to edit, even on an empty group", async () => {
    api.canWrite = false;
    api.get.mockResolvedValue({
      id: "building",
      name: "Comfort",
      filter: { tags: { group: ["comfort"] } },
      group_by: [],
    });
    api.list.mockResolvedValue([]);
    setup();
    await screen.findByText("groups.empty");
    expect(
      screen.queryByRole("link", { name: "groups.editInConfiguration" }),
    ).not.toBeInTheDocument();
  });
});
