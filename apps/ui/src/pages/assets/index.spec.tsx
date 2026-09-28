import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GridoneError, type Asset } from "@gridone/sdk";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createI18nMock } from "@/test/i18nMock";
import type { AssetTreeNode } from "@/lib/assets";
import Assets from "./index";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  get: vi.fn(),
  list: vi.fn(),
  tree: vi.fn(),
  listDevices: vi.fn(),
  devices: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  commands: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    mocks.permissions.has(permission),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    assets: {
      get: mocks.get,
      list: mocks.list,
      getTreeWithDevices: mocks.tree,
      listDevices: mocks.listDevices,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.remove,
    },
    devices: { list: mocks.devices },
  }),
}));
vi.mock("../devices/commands/new/NewCommandPage", () => ({
  default: () => {
    mocks.commands();
    return <div>Zone command form</div>;
  },
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Zones",
    create: "Create zone",
    singular: "Zone",
    "fields.name": "Name",
    "fields.type": "Type",
    "editPage.saveChanges": "Save changes",
    "commands.newCommand": "Send command",
    "errors.forbidden": "Access denied",
    "errors.notFound": "Not found",
    "errors.default": "Loading failed",
    "empty.title": "No zones yet",
  }),
);

const org: Asset = {
  id: "org",
  name: "Organization",
  type: "org",
  parent_id: null,
};
const building: Asset = {
  id: "building",
  name: "Hotel",
  type: "building",
  parent_id: "org",
};
const zone: Asset = {
  id: "zone",
  name: "Lobby",
  type: "zone",
  parent_id: "building",
  path: ["org", "building", "zone"],
};
const allAssets = [org, building, zone];
const tree: AssetTreeNode[] = [
  {
    ...org,
    children: [{ ...building, children: [{ ...zone, children: [] }] }],
  },
];
const paths = [
  "/assets",
  "/assets/zone",
  "/assets/new",
  "/assets/zone/edit",
  "/assets/zone/commands/new",
];

function mount(path: string, cached = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  if (cached) {
    client.setQueryData(["assets", "tree-with-devices"], tree);
    client.setQueryData(["assets"], allAssets);
    client.setQueryData(["assets", "zone"], zone);
  }
  const router = createMemoryRouter(
    [{ path: "/assets/*", element: <Assets /> }],
    { initialEntries: [path] },
  );
  const view = () => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
  render(view());
  return { router };
}

function expectNoAssetRequests() {
  for (const fn of [
    mocks.get,
    mocks.list,
    mocks.tree,
    mocks.listDevices,
    mocks.create,
    mocks.update,
    mocks.remove,
    mocks.devices,
    mocks.commands,
  ])
    expect(fn).not.toHaveBeenCalled();
}
function expectNoEditLinks() {
  expect(
    screen
      .queryAllByRole("link")
      .filter((link) =>
        /\/assets\/(new|[^/]+\/edit)/.test(link.getAttribute("href") ?? ""),
      ),
  ).toHaveLength(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions = new Set(["assets:read", "assets:write", "devices:write"]);
  mocks.get.mockResolvedValue(zone);
  mocks.list.mockImplementation(async (params?: { parent_id?: string }) =>
    params?.parent_id ? [] : allAssets,
  );
  mocks.tree.mockResolvedValue(tree);
  mocks.listDevices.mockResolvedValue([]);
  mocks.devices.mockResolvedValue([]);
  mocks.update.mockResolvedValue(zone);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("zone route permissions", () => {
  it.each(paths)(
    "blocks %s without assets:read, despite write rights and cached zones",
    async (path) => {
      mocks.permissions.delete("assets:read");
      mount(path, true);
      expect(
        await screen.findByRole("heading", { name: "Access denied" }),
      ).toBeVisible();
      expect(screen.queryByText("Lobby")).not.toBeInTheDocument();
      expectNoAssetRequests();
    },
  );

  it.each(["/assets/new", "/assets/zone/edit"])(
    "blocks a read-only user on %s before loading forms",
    async (path) => {
      mocks.permissions = new Set(["assets:read"]);
      mount(path, true);
      expect(
        await screen.findByRole("heading", { name: "Access denied" }),
      ).toBeVisible();
      expectNoAssetRequests();
    },
  );

  it("keeps the zone tree readable without creation, editing or bulk controls", async () => {
    mocks.permissions = new Set(["assets:read"]);
    mount("/assets");
    expect(await screen.findByText("Lobby")).toBeVisible();
    expectNoEditLinks();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps zone details readable without mutation controls", async () => {
    mocks.permissions = new Set(["assets:read"]);
    mount("/assets/zone");
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
    expectNoEditLinks();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Send command" }),
    ).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("allows creation with asset write permission", async () => {
    mount("/assets/new?type=zone");
    expect(
      await screen.findByRole("heading", { name: "Create zone" }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: /Name/ })).toBeEnabled();
  });

  it("allows a writer to save an edited zone", async () => {
    mount("/assets/zone/edit");
    const name = await screen.findByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Reception");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        "zone",
        expect.objectContaining({ name: "Reception" }),
      ),
    );
  });

  it("requires devices:write to open zone commands even for an asset writer", async () => {
    mocks.permissions.delete("devices:write");
    mount("/assets/zone/commands/new");
    expect(
      await screen.findByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    expectNoAssetRequests();
  });

  it("allows zone commands with devices:write without requiring assets:write", async () => {
    mocks.permissions.delete("assets:write");
    mount("/assets/zone/commands/new");
    expect(await screen.findByText("Zone command form")).toBeVisible();
  });

  it("removes cached zone content when read permission is revoked", async () => {
    const { router } = mount("/assets/zone", true);
    await screen.findByRole("heading", { name: "Lobby" });
    mocks.permissions.clear();
    await act(async () => router.navigate("/assets/zone"));
    expect(
      screen.getByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Lobby" }),
    ).not.toBeInTheDocument();
  });
});

describe("zone loading errors", () => {
  it.each(["/assets", "/assets/zone", "/assets/new", "/assets/zone/edit"])(
    "shows access denied for API 403s on %s, including cached data",
    async (path) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new GridoneError(403, "Internal detail");
      mocks.tree.mockRejectedValue(error);
      mocks.get.mockRejectedValue(error);
      mocks.list.mockRejectedValue(error);
      mount(path, true);
      expect(
        await screen.findByRole("heading", { name: "Access denied" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "Lobby" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("No zones yet")).not.toBeInTheDocument();
      expect(screen.queryByText(/Internal detail/)).not.toBeInTheDocument();
    },
  );

  it("shows a generic error for a failed tree request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.tree.mockRejectedValue(new GridoneError(500, "Internal detail"));
    mount("/assets");
    expect(
      await screen.findByRole("heading", { name: "Loading failed" }),
    ).toBeVisible();
    expect(screen.queryByText("No zones yet")).not.toBeInTheDocument();
  });

  it("shows not found instead of loading forever, and recovers when navigating to another zone", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.get.mockImplementation(async (id: string) => {
      if (id === "missing") throw new GridoneError(404, "Not found");
      return zone;
    });
    const { router } = mount("/assets/missing");
    expect(
      await screen.findByRole("heading", { name: "Not found" }),
    ).toBeVisible();
    await act(async () => router.navigate("/assets/zone"));
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeVisible();
  });
});
