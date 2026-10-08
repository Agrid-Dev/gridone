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
import type {
  DashboardStructure,
  DashboardStructureUpdate,
  DashboardSummary,
  GridoneClient,
  StructureItem,
  StructureItemRef,
  StructureSection,
} from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { createI18nMock } from "@/test/i18nMock";
import { DASHBOARD_ICONS } from "@/lib/dashboardIcons";

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Dashboards",
    "switcher.new": "New dashboard",
    "manage.drag": "Move {{name}}",
    "manage.actions": "Actions for {{name}}",
    "structure.empty.group": "No dashboard yet.",
    "structure.empty.section": "Empty section.",
    "actions.edit": "Edit details",
    "actions.delete": "Delete",
    "edit.title": "Edit dashboard details",
    "edit.submit": "Save changes",
    "fields.name": "Name",
    "fields.type": "Type",
    "fields.description": "Description",
    "fields.icon": "Icon",
    "icon.none": "No icon",
    "types.live.label": "Live",
    "types.history.label": "History",
    "types.locked": "The type is set at creation.",
    "structure.newSection": "New section",
    "structure.newGroup": "New group",
    "structure.fields.label": "Label",
    "structure.create.section": "New section",
    "structure.create.group": "New group",
    "structure.edit.group": "Edit group",
    "structure.delete.details": "The dashboards in {{name}} are kept.",
    "common:common.create": "Create",
    "common:empty.create.dashboards": "Create a dashboard",
    "common:common.cancel": "Cancel",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common:common.edit": "Edit",
    "common:common.delete": "Delete",
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
  type: DashboardSummary["type"] = "live",
) => ({ id, name, type, description, icon, metadata: {} }) as DashboardSummary;
const DASHBOARDS = [
  summary("d1", "ECS Ouest", "Hot water, west wing", "droplets"),
  summary("d2", "CTA"),
  summary("d3", "Comptage", undefined, null, "history"),
];
const flat = (items: DashboardSummary[]): DashboardStructure => ({
  items: items.map((d) => ({ ...d, kind: "dashboard" })),
});
/** CVC › [CTA, ECS › [ECS Ouest]], Comptage. */
const NESTED: DashboardStructure = {
  items: [
    {
      kind: "section",
      id: "s1",
      label: "CVC",
      items: [
        { ...DASHBOARDS[1], kind: "dashboard" },
        {
          kind: "group",
          id: "g1",
          label: "ECS",
          icon: "droplets",
          dashboards: [DASHBOARDS[0]],
        },
      ],
    },
    { ...DASHBOARDS[2], kind: "dashboard" },
  ],
};

const client = {
  dashboards: {
    getStructure: vi.fn(),
    updateStructure: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

function renderPage(structure: DashboardStructure = flat(DASHBOARDS)) {
  client.dashboards.getStructure.mockResolvedValue(structure);
  // The server stores what it is given, ids assigned to new nodes, and
  // answers with the tree hydrated.
  const byId = new Map(DASHBOARDS.map((d) => [d.id, d]));
  const hydrate = (item: StructureItemRef, i: number): StructureItem => {
    if (item.kind === "dashboard")
      return { ...byId.get(item.id)!, kind: "dashboard" };
    if (item.kind === "group")
      return {
        kind: "group",
        id: item.id || `new-${i}`,
        label: item.label,
        icon: item.icon ?? null,
        dashboards: (item.dashboards ?? []).map((id) => byId.get(id)!),
      };
    return {
      kind: "section",
      id: item.id || `new-${i}`,
      label: item.label,
      items: (item.items ?? []).map(hydrate) as StructureSection["items"],
    };
  };
  client.dashboards.updateStructure.mockImplementation(
    async (update: DashboardStructureUpdate) => ({
      items: (update.items ?? []).map(hydrate),
    }),
  );
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

/** Every node drawn, in document order: `kind:label`. */
const nodes = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-kind]")).map(
    (el) =>
      `${el.dataset.kind}:${
        el.dataset.kind === "section"
          ? el.getAttribute("aria-label")
          : (el.querySelector("span.truncate")?.textContent ?? "")
      }`,
  );

/** Pick an action from an entry's ⋯ menu. */
async function pickAction(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  action: "Edit" | "Delete",
) {
  await user.click(screen.getByRole("button", { name: `Actions for ${name}` }));
  await user.click(await screen.findByRole("menuitem", { name: action }));
}

beforeEach(() => {
  window.localStorage.clear();
  permissions.write = true;
  client.dashboards.getStructure.mockReset();
  client.dashboards.updateStructure.mockReset();
  client.dashboards.update.mockReset().mockResolvedValue(DASHBOARDS[0]);
  client.dashboards.delete.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("DashboardsManage", () => {
  it("draws one row per entry, nested under its container, and persists a drop", async () => {
    renderPage(NESTED);
    await waitFor(() => expect(nodes()).toHaveLength(5));
    expect(nodes()).toEqual([
      "section:CVC",
      "dashboard:CTA",
      "group:ECS",
      "dashboard:ECS Ouest",
      "dashboard:Comptage",
    ]);
    // Dashboards sit inside their containers; the type rides the row.
    const section = screen.getByRole("region", { name: "CVC" });
    const westTile = within(section)
      .getByText("ECS Ouest")
      .closest("[data-kind]") as HTMLElement;
    expect(westTile).toHaveAttribute("data-kind", "dashboard");
    expect(westTile.parentElement?.closest("[data-kind]")).toHaveAttribute(
      "data-kind",
      "group",
    );
    expect(
      screen.getByText("Comptage").closest("[data-kind=dashboard]"),
    ).toHaveTextContent("History");
    expect(screen.getByRole("link", { name: "New dashboard" })).toHaveAttribute(
      "href",
      "/dashboards/new",
    );
    // No row carries its own edit and delete buttons any more.
    expect(
      screen.queryByRole("button", { name: /^(Edit|Delete) / }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move ECS" }),
    ).toBeInTheDocument();

    // Comptage dropped on CTA's tile lands before it, in CVC.
    dnd.onDragEnd!({
      active: { id: "d3" },
      over: { id: "d2" },
    } as unknown as DragEndEvent);

    await waitFor(() =>
      expect(client.dashboards.updateStructure).toHaveBeenCalledWith({
        items: [
          {
            kind: "section",
            id: "s1",
            label: "CVC",
            items: [
              { kind: "dashboard", id: "d3" },
              { kind: "dashboard", id: "d2" },
              {
                kind: "group",
                id: "g1",
                label: "ECS",
                icon: "droplets",
                dashboards: ["d1"],
              },
            ],
          },
        ],
      }),
    );
    await waitFor(() =>
      expect(nodes()).toEqual([
        "section:CVC",
        "dashboard:Comptage",
        "dashboard:CTA",
        "group:ECS",
        "dashboard:ECS Ouest",
      ]),
    );
  });

  it("creates a group from the editor, appended at the root without an id", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(nodes()).toHaveLength(3));

    await user.click(screen.getByRole("button", { name: "New group" }));
    const dialog = screen.getByRole("dialog", { name: "New group" });
    await user.type(within(dialog).getByLabelText(/Label/), "Hot water");
    await user.click(within(dialog).getByRole("button", { name: "fan" }));
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(client.dashboards.updateStructure).toHaveBeenCalledWith({
        items: [
          { kind: "dashboard", id: "d1" },
          { kind: "dashboard", id: "d2" },
          { kind: "dashboard", id: "d3" },
          {
            kind: "group",
            id: null,
            label: "Hot water",
            icon: "fan",
            dashboards: [],
          },
        ],
      }),
    );
    await waitFor(() => expect(nodes()).toHaveLength(4));
    expect(nodes()[3]).toBe("group:Hot water");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("creates a section from the page header, appended at the root", async () => {
    const user = userEvent.setup();
    renderPage(NESTED);
    await waitFor(() => expect(nodes()).toHaveLength(5));
    const title = screen.getByRole("heading", { name: "Dashboards" });
    const newSection = screen.getByRole("button", { name: "New section" });
    // It sits beside the page title, before the tree.
    expect(
      title.compareDocumentPosition(newSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      newSection.compareDocumentPosition(
        document.querySelector("[data-kind]")!,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(newSection);
    const dialog = screen.getByRole("dialog", { name: "New section" });
    await user.type(within(dialog).getByLabelText(/Label/), "Air");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(client.dashboards.updateStructure).toHaveBeenCalledWith({
        items: [
          {
            kind: "section",
            id: "s1",
            label: "CVC",
            items: [
              { kind: "dashboard", id: "d2" },
              {
                kind: "group",
                id: "g1",
                label: "ECS",
                icon: "droplets",
                dashboards: ["d1"],
              },
            ],
          },
          { kind: "dashboard", id: "d3" },
          { kind: "section", id: null, label: "Air", items: [] },
        ],
      }),
    );
  });

  it("deletes a group after confirmation, lifting its dashboards in place", async () => {
    const user = userEvent.setup();
    renderPage(NESTED);
    await waitFor(() => expect(nodes()).toHaveLength(5));

    await pickAction(user, "ECS", "Delete");
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveTextContent("The dashboards in ECS are kept.");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(client.dashboards.updateStructure).toHaveBeenCalledWith({
        items: [
          {
            kind: "section",
            id: "s1",
            label: "CVC",
            items: [
              { kind: "dashboard", id: "d2" },
              { kind: "dashboard", id: "d1" },
            ],
          },
          { kind: "dashboard", id: "d3" },
        ],
      }),
    );
    expect(client.dashboards.delete).not.toHaveBeenCalled();
  });

  it("renames and re-describes a dashboard from its row menu", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(nodes()).toHaveLength(3));

    await pickAction(user, "CTA", "Edit");
    const dialog = screen.getByRole("dialog", {
      name: "Edit dashboard details",
    });
    const name = within(dialog).getByLabelText(/Name/);
    expect(name).toHaveValue("CTA");
    // The type is fixed at creation: shown, not editable, and not sent.
    expect(
      within(dialog).getByTestId("dashboard-type-locked"),
    ).toHaveTextContent("Live");
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
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
    await waitFor(() => expect(nodes()).toHaveLength(3));

    await pickAction(user, "ECS Ouest", "Edit");
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
    await waitFor(() => expect(nodes()).toHaveLength(3));

    await pickAction(user, "ECS Ouest", "Edit");
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
    await waitFor(() => expect(nodes()).toHaveLength(3));

    await pickAction(user, "Comptage", "Delete");
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
    renderPage({ items: [] });
    await waitFor(() =>
      expect(
        screen.getAllByRole("link", {
          name: /New dashboard|Create a dashboard/,
        }),
      ).toHaveLength(2),
    );
    expect(document.querySelector("[data-kind]")).toBeNull();
  });

  it("keeps the page from a reader", () => {
    permissions.write = false;
    renderPage();
    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "New dashboard" }),
    ).not.toBeInTheDocument();
    expect(client.dashboards.getStructure).not.toHaveBeenCalled();
  });
});
