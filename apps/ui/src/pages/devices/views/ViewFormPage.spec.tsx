import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import ViewFormPage from "./ViewFormPage";
const api = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  drivers: vi.fn(),
  get: vi.fn(),
  listTags: vi.fn(),
  update: vi.fn(),
  bulkTags: vi.fn(),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    deviceViews: api,
    devices: { listTags: api.listTags, list: api.list, bulkTags: api.bulkTags },
    drivers: { list: api.drivers },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({ usePermissions: () => () => true }));
vi.mock("react-i18next", () => createI18nMock({}));
beforeEach(() => {
  vi.resetAllMocks();
  api.drivers.mockResolvedValue([{ id: "driver" }, { id: "different" }]);
  const devices = [
    {
      id: "a",
      name: "Compatible",
      driver_id: "driver",
      transport_id: "t",
      config: {},
      tags: { group: ["comfort", "another-group"] },
    },
    {
      id: "b",
      name: "Incompatible",
      driver_id: "different",
      transport_id: "t",
      config: {},
      tags: { group: ["another-group"] },
    },
  ];
  api.list.mockImplementation(async (params) =>
    params?.tags
      ? devices.filter((device) =>
          device.tags.group.includes(params.tags[0].split(":")[1]),
        )
      : devices,
  );
  api.create.mockResolvedValue({ id: "created" });
  api.listTags.mockResolvedValue([]);
  api.update.mockResolvedValue({ id: "group" });
  api.bulkTags.mockImplementation(async (body) =>
    body.target.ids.map((id: string) => ({ device_id: id, status: "changed" })),
  );
});
afterEach(cleanup);
function setup(path = "/devices/views/new?advanced=1") {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={cache}>
        <Routes>
          <Route path="/devices/views/new" element={<ViewFormPage />} />
          <Route
            path="/devices/views/:viewId/edit"
            element={<ViewFormPage />}
          />
          <Route path="/devices/views/:viewId" element={<p>Saved view</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
describe("saved view form", () => {
  it("saves normalized criteria and ordered keys without device membership", async () => {
    setup();
    await screen.findByRole("option", { name: "driver" });
    fireEvent.change(screen.getByLabelText("views.fields.name"), {
      target: { value: " Building " },
    });
    fireEvent.change(screen.getByLabelText("views.fields.tags"), {
      target: { value: "Étage:2, étage:3" },
    });
    fireEvent.change(screen.getByLabelText("views.fields.groupBy"), {
      target: { value: "Étage, Pièce" },
    });
    fireEvent.click(screen.getByRole("button", { name: "views.save" }));
    await screen.findByText("Saved view");
    expect(api.create).toHaveBeenCalledWith({
      name: "Building",
      description: null,
      filter: { driver_id: null, tags: { étage: ["2", "3"] } },
      group_by: ["étage", "pièce"],
    });
    expect(api.list).not.toHaveBeenCalled();
  });
  it("keeps persisted type criteria when editing presentation settings", async () => {
    api.get.mockResolvedValue({
      id: "group",
      name: "East",
      description: "",
      filter: {
        tags: { ecs: ["east"] },
        types: ["thermostat"],
        driver_id: "driver",
      },
      group_by: ["ecs"],
    });
    setup("/devices/views/group/edit");
    await screen.findByDisplayValue("East");
    fireEvent.change(screen.getByLabelText("views.fields.name"), {
      target: { value: "Comfort" },
    });
    fireEvent.click(screen.getByRole("button", { name: "views.save" }));
    await screen.findByText("Saved view");
    expect(api.update).toHaveBeenCalledWith("group", {
      name: "Comfort",
      description: null,
      filter: {
        tags: { ecs: ["east"] },
        types: ["thermostat"],
        driver_id: "driver",
      },
      group_by: ["ecs"],
    });
  });
  it("rejects malformed filters and duplicate grouping keys", async () => {
    setup();
    await screen.findByRole("option", { name: "driver" });
    fireEvent.change(screen.getByLabelText("views.fields.name"), {
      target: { value: "Building" },
    });
    fireEvent.change(screen.getByLabelText("views.fields.tags"), {
      target: { value: "floor" },
    });
    fireEvent.change(screen.getByLabelText("views.fields.groupBy"), {
      target: { value: "floor, FLOOR" },
    });
    fireEvent.click(screen.getByRole("button", { name: "views.save" }));
    expect((await screen.findAllByText("views.invalid")).length).toBe(2);
    expect(api.create).not.toHaveBeenCalled();
  });
});

describe("create a group by choosing devices", () => {
  it("opens with a name and devices, and saves a tag-backed group with mixed drivers", async () => {
    setup("/devices/views/new");
    await screen.findByRole("checkbox", { name: "Compatible" });
    expect(
      screen.queryByLabelText("views.fields.tags"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("views.fields.groupBy"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("groups.name"), {
      target: { value: " Thermostats étage 2 " },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Compatible" }));
    fireEvent.change(screen.getByLabelText("groups.filterDriver"), {
      target: { value: "different" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Incompatible" }));
    expect(
      screen.getAllByRole("button", { name: "groups.removeMember" }),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "groups.save" }));
    await screen.findByText("Saved view");
    expect(api.create).toHaveBeenCalledWith({
      name: "Thermostats étage 2",
      description: null,
      filter: { tags: { group: [expect.any(String)] } },
      group_by: [],
    });
    const value = api.create.mock.calls[0][0].filter.tags.group[0];
    expect(api.bulkTags).toHaveBeenCalledExactlyOnceWith({
      target: { ids: ["a", "b"] },
      key: "group",
      values: [value],
      operation: "add",
    });
    expect(api.update).not.toHaveBeenCalled();
  });

  it("loads checked members and edits only this group's value, even when renamed", async () => {
    api.get.mockResolvedValue({
      id: "group",
      name: "Comfort",
      filter: { tags: { group: ["comfort"] } },
      group_by: [],
    });
    setup("/devices/views/group/edit");
    expect(
      await screen.findByRole("checkbox", { name: "Compatible" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Incompatible" }),
    ).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("groups.name"), {
      target: { value: "New name" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Compatible" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Incompatible" }));
    fireEvent.click(screen.getByRole("button", { name: "groups.save" }));
    await screen.findByText("Saved view");
    expect(api.create).not.toHaveBeenCalled();
    expect(api.bulkTags.mock.calls.map(([body]) => body)).toEqual([
      {
        target: { ids: ["b"] },
        key: "group",
        values: ["comfort"],
        operation: "add",
      },
      {
        target: { ids: ["a"] },
        key: "group",
        values: ["comfort"],
        operation: "remove",
      },
    ]);
    expect(api.update).toHaveBeenCalledWith("group", {
      name: "New name",
      description: null,
      filter: { tags: { group: ["comfort"] } },
      group_by: [],
    });
  });

  it("retains the selection after a partial failure and retries without creating a duplicate group", async () => {
    api.bulkTags.mockResolvedValueOnce([{ device_id: "a", status: "failed" }]);
    setup("/devices/views/new");
    await screen.findByRole("checkbox", { name: "Compatible" });
    fireEvent.change(screen.getByLabelText("groups.name"), {
      target: { value: "Comfort" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Compatible" }));
    fireEvent.click(screen.getByRole("button", { name: "groups.save" }));
    await screen.findByText("groups.membersSaveFailed");
    expect(screen.getByRole("checkbox", { name: "Compatible" })).toBeChecked();
    expect(screen.queryByText("Saved view")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "groups.save" }));
    await screen.findByText("Saved view");
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.bulkTags).toHaveBeenCalledTimes(2);
    expect(api.update).toHaveBeenCalledWith("created", expect.any(Object));
  });

  it("can create an empty group without an unrestricted tag mutation", async () => {
    setup("/devices/views/new");
    await screen.findByRole("checkbox", { name: "Compatible" });
    fireEvent.change(screen.getByLabelText("groups.name"), {
      target: { value: "Future group" },
    });
    fireEvent.click(screen.getByRole("button", { name: "groups.save" }));
    await screen.findByText("Saved view");
    expect(api.bulkTags).not.toHaveBeenCalled();
    expect(api.create.mock.calls[0][0].filter.tags.group).toHaveLength(1);
  });

  it("requires a name before saving", async () => {
    setup("/devices/views/new");
    await screen.findByRole("checkbox", { name: "Compatible" });
    fireEvent.click(screen.getByRole("button", { name: "groups.save" }));
    await waitFor(() =>
      expect(screen.getByText("groups.nameRequired")).toBeInTheDocument(),
    );
    expect(api.create).not.toHaveBeenCalled();
  });
});
