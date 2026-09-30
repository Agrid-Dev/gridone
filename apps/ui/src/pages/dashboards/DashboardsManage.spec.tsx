import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ComponentProps } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { DashboardSummary, GridoneClient } from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { createI18nMock } from "@/test/i18nMock";
import { DASHBOARD_ICONS } from "@/lib/dashboardIcons";

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Dashboards",
    "switcher.new": "New dashboard",
    "manage.drag": "Move {{name}}",
    "manage.actions": "Actions for {{name}}",
    "actions.edit": "Edit details",
    "actions.delete": "Delete",
    "edit.title": "Edit dashboard details",
    "edit.submit": "Save changes",
    "fields.name": "Name",
    "fields.description": "Description",
    "fields.icon": "Icon",
    "icon.none": "No icon",
    "common:empty.create.dashboards": "Create a dashboard",
    "common:common.cancel": "Cancel",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "errors.forbidden": "Forbidden",
  }),
);

const permissions = { write: true };
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    permission === "dashboards:write" && permissions.write,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** The drag-and-drop context, kept real, with its drop handler in reach. */
const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      dnd.onDragEnd = props.onDragEnd;
      return <actual.DndContext {...props} />;
    },
  };
});

import DashboardsManage from "./DashboardsManage";

const summary = (
  id: string,
  name: string,
  description?: string,
  icon: DashboardSummary["icon"] = null,
) => ({ id, name, description, icon, metadata: {} }) as DashboardSummary;
const DASHBOARDS = [
  summary("d1", "ECS Ouest", "Hot water, west wing", "droplets"),
  summary("d2", "CTA"),
  summary("d3", "Comptage"),
];

const client = {
  dashboards: {
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
  },
};

function renderPage(items: DashboardSummary[] = DASHBOARDS) {
  client.dashboards.list.mockResolvedValue(items);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <GridoneClientProvider client={client as unknown as GridoneClient}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboards/manage"]}>
          <DashboardsManage />
        </MemoryRouter>
      </QueryClientProvider>
    </GridoneClientProvider>,
  );
}

const rows = () => screen.getAllByRole("listitem");

beforeEach(() => {
  window.localStorage.clear();
  permissions.write = true;
  client.dashboards.list.mockReset();
  client.dashboards.update.mockReset().mockResolvedValue(DASHBOARDS[0]);
  client.dashboards.delete.mockReset().mockResolvedValue(undefined);
  client.dashboards.reorder.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("DashboardsManage", () => {
  it("lists the dashboards in the API's order, each with a handle, and persists a drop", async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows().map((row) => row.textContent)).toEqual([
      "ECS OuestHot water, west wing",
      "CTA",
      "Comptage",
    ]);
    expect(screen.getByRole("link", { name: "New dashboard" })).toHaveAttribute(
      "href",
      "/dashboards/new",
    );
    expect(
      screen.getByRole("button", { name: "Move CTA" }),
    ).toBeInTheDocument();
    // The server keeps the order it is given.
    client.dashboards.reorder.mockImplementation(
      async ({ ordered_ids }: { ordered_ids: string[] }) => {
        client.dashboards.list.mockResolvedValue(
          ordered_ids.map((id) => DASHBOARDS.find((d) => d.id === id)),
        );
      },
    );

    dnd.onDragEnd!({
      active: { id: "d3" },
      over: { id: "d1" },
    } as unknown as DragEndEvent);

    await waitFor(() =>
      expect(client.dashboards.reorder).toHaveBeenCalledWith({
        ordered_ids: ["d3", "d1", "d2"],
      }),
    );
    expect(rows().map((row) => row.textContent)).toEqual([
      "Comptage",
      "ECS OuestHot water, west wing",
      "CTA",
    ]);
  });

  it("renames and re-describes a dashboard from its row menu", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));

    await user.click(screen.getByRole("button", { name: "Actions for CTA" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }));
    const dialog = screen.getByRole("dialog", {
      name: "Edit dashboard details",
    });
    const name = within(dialog).getByLabelText(/Name/);
    expect(name).toHaveValue("CTA");
    await user.clear(name);
    await user.type(name, "CTA Nord");
    await user.type(within(dialog).getByLabelText(/Description/), "Roof units");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(client.dashboards.update).toHaveBeenCalledWith("d2", {
        name: "CTA Nord",
        description: "Roof units",
        icon: null,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("restores the picked icon on edit, offers every icon plus none, and saves the change", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));

    await user.click(
      screen.getByRole("button", { name: "Actions for ECS Ouest" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }));
    const grid = within(screen.getByRole("group", { name: "Icon" }));
    expect(grid.getByRole("button", { name: "droplets" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(grid.getAllByRole("button")).toHaveLength(
      Object.keys(DASHBOARD_ICONS).length + 1,
    );

    await user.click(grid.getByRole("button", { name: "fan" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(client.dashboards.update).toHaveBeenCalledWith(
        "d1",
        expect.objectContaining({ icon: "fan" }),
      ),
    );
  });

  it("clears the icon through the none cell", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));

    await user.click(
      screen.getByRole("button", { name: "Actions for ECS Ouest" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit details" }));
    await user.click(screen.getByRole("button", { name: "No icon" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(client.dashboards.update).toHaveBeenCalledWith(
        "d1",
        expect.objectContaining({ icon: null }),
      ),
    );
  });

  it("deletes a dashboard from its row menu, after confirmation", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));

    await user.click(
      screen.getByRole("button", { name: "Actions for Comptage" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(client.dashboards.delete).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() =>
      expect(client.dashboards.delete).toHaveBeenCalledWith("d3"),
    );
  });

  it("offers creation, and nothing else, when there is no dashboard yet", async () => {
    renderPage([]);
    await waitFor(() =>
      expect(
        screen.getAllByRole("link", {
          name: /New dashboard|Create a dashboard/,
        }),
      ).toHaveLength(2),
    );
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("keeps the page from a reader", () => {
    permissions.write = false;
    renderPage();
    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "New dashboard" }),
    ).not.toBeInTheDocument();
    expect(client.dashboards.list).not.toHaveBeenCalled();
  });
});
