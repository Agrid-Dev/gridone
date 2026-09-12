import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import GroupFormPage from "./GroupFormPage";
const api = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  drivers: vi.fn(),
  get: vi.fn(),
  references: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: { groups: api, list: api.list },
    drivers: { list: api.drivers },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({ usePermissions: () => () => true }));
vi.mock("react-i18next", () => createI18nMock({}));
beforeEach(() => {
  vi.clearAllMocks();
  api.drivers.mockResolvedValue([{ id: "driver" }, { id: "different" }]);
  api.list.mockResolvedValue([
    {
      id: "a",
      name: "Compatible",
      driver_id: "driver",
      transport_id: "t",
      config: {},
    },
    {
      id: "b",
      name: "Incompatible",
      driver_id: "different",
      transport_id: "t",
      config: {},
    },
  ]);
  api.create.mockResolvedValue({ id: "created" });
  api.references.mockResolvedValue([]);
  api.update.mockResolvedValue({ id: "group" });
});
afterEach(cleanup);
function setup(path = "/devices/groups/new") {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={cache}>
        <Routes>
          <Route path="/devices/groups/new" element={<GroupFormPage />} />
          <Route
            path="/devices/groups/:groupId/edit"
            element={<GroupFormPage />}
          />
          <Route path="/devices/groups/:groupId" element={<p>Saved group</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
describe("create group", () => {
  it("selects only explicit compatible members and saves without a command", async () => {
    setup();
    await screen.findByRole("option", { name: "driver" });
    fireEvent.change(screen.getByLabelText("groups.name"), {
      target: { value: " East " },
    });
    fireEvent.change(screen.getByLabelText("groups.driver"), {
      target: { value: "driver" },
    });
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Compatible" }),
    );
    expect(
      screen.queryByRole("checkbox", { name: "Incompatible" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "groups.save" }));
    await screen.findByText("Saved group");
    expect(api.create).toHaveBeenCalledWith({
      name: "East",
      description: "",
      driver_id: "driver",
      device_ids: ["a"],
    });
  });

  it("keeps hidden selections when editing and presents the fixed driver as information", async () => {
    api.get.mockResolvedValue({
      id: "group",
      name: "East",
      description: "",
      driver_id: "driver",
      device_ids: ["a", "c"],
    });
    api.list.mockResolvedValue([
      { id: "a", name: "First", driver_id: "driver" },
      { id: "c", name: "Second", driver_id: "driver" },
    ]);
    setup("/devices/groups/group/edit");
    expect(
      await screen.findByRole("checkbox", { name: "First" }),
    ).toBeChecked();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("driver")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Second" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Second" }));
    fireEvent.click(screen.getByRole("button", { name: "groups.save" }));
    await screen.findByText("Saved group");
    expect(api.update).toHaveBeenCalledWith("group", {
      name: "East",
      description: "",
      device_ids: ["a"],
    });
  });
});
