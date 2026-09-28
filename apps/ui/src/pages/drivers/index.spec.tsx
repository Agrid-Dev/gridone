import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GridoneError, type Driver } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import Routes from "./index";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  list: vi.fn(),
  get: vi.fn(),
  presentation: vi.fn(),
  schemas: vi.fn(),
  install: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reconnect: vi.fn(),
  devices: vi.fn(),
  tree: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    mocks.permissions.has(permission),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    drivers: {
      list: mocks.list,
      get: mocks.get,
      getPresentation: mocks.presentation,
      getSchemas: mocks.schemas,
      installPackage: mocks.install,
      update: mocks.update,
      delete: mocks.remove,
      reconnect: mocks.reconnect,
    },
    devices: { list: mocks.devices },
    assets: { getTreeWithDevices: mocks.tree },
  }),
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    "errors.forbidden": "Access denied",
    "errors.notFound": "Not found",
    "errors.default": "Loading failed",
  }),
);
const resource: Driver = {
  id: "item",
  transport: "http",
  device_config: [],
  attributes: [],
  presentation_revision: null,
};

function mount(path: string, cached = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  if (cached)
    client.setQueryData(["drivers"], [resource], {
      updatedAt: Date.now() - 10_000,
    });
  const router = createMemoryRouter(
    [{ path: "/drivers/*", element: <Routes /> }],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}
function expectNoRequests() {
  for (const [key, value] of Object.entries(mocks))
    if (key !== "permissions") expect(value).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permissions = new Set([
    "drivers:read",
    "drivers:write",
    "transports:read",
    "transports:write",
  ]);
  mocks.get.mockResolvedValue(resource);
  mocks.list.mockResolvedValue([resource]);
  mocks.presentation.mockResolvedValue({
    status: "available",
    revision: "revision-1",
    diagnostics: [],
  });
  mocks.schemas.mockResolvedValue({ http: { type: "object", properties: {} } });
  mocks.devices.mockResolvedValue([]);
  mocks.tree.mockResolvedValue([]);
  mocks.install.mockResolvedValue(resource);
  mocks.update.mockResolvedValue(resource);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("drivers route permissions", () => {
  it.each(["/drivers", "/drivers/item", "/drivers/new", "/drivers/item/edit"])(
    "blocks %s without read permission, despite write rights and cached data",
    async (path) => {
      mocks.permissions.delete("drivers:read");
      mount(path, true);
      expect(
        await screen.findByRole("heading", { name: "Access denied" }),
      ).toBeVisible();
      expectNoRequests();
    },
  );
  it.each(["/drivers/new", "/drivers/item/edit"])(
    "blocks read-only access to %s before mounting the form",
    async (path) => {
      mocks.permissions.delete("drivers:write");
      mount(path, true);
      expect(
        await screen.findByRole("heading", { name: "Access denied" }),
      ).toBeVisible();
      expectNoRequests();
    },
  );
  it.each(["/drivers", "/drivers/item"])(
    "keeps %s readable without write controls",
    async (path) => {
      mocks.permissions = new Set(["drivers:read"]);
      mount(path);
      expect(
        await screen.findByRole(path === "/drivers" ? "link" : "heading", {
          name: "item",
        }),
      ).toBeVisible();
      expect(
        screen
          .queryAllByRole("link")
          .filter((link) =>
            /\/(new|edit)$/.test(link.getAttribute("href") ?? ""),
          ),
      ).toHaveLength(0);
      for (const name of ["actions.delete", "package.replace"])
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.reconnect).not.toHaveBeenCalled();
    },
  );
  it.each(["/drivers/new", "/drivers/item/edit"])(
    "allows a writer to submit %s",
    async (path) => {
      mocks.permissions = new Set(["drivers:read", "drivers:write"]);
      mount(path);
      const input = await screen.findByRole("textbox", {
        name: "package.yaml",
      });
      fireEvent.change(input, {
        target: { value: "id: item\ntransport: http\n" },
      });
      const submit = screen.getByRole("button", {
        name: path.endsWith("new") ? "package.install" : "package.replace",
      });
      await waitFor(() => expect(submit).toBeEnabled());
      await userEvent.click(submit);
      await waitFor(() =>
        expect(mocks.install).toHaveBeenCalledWith("item", expect.any(Blob), {
          expectedRevision: path.endsWith("new") ? undefined : "revision-1",
        }),
      );
    },
  );
  it("hides cached details after read permission is revoked", async () => {
    const { router } = mount("/drivers/item", true);
    await screen.findByRole("heading", { name: "item" });
    mocks.permissions.delete("drivers:read");
    await act(async () => router.navigate("/drivers/item"));
    expect(
      screen.getByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "item" }),
    ).not.toBeInTheDocument();
  });
});
describe("drivers forbidden responses", () => {
  it.each([false, true])(
    "handles list/detail/edit 403s (cached: %s)",
    async (cached) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.list.mockRejectedValue(new GridoneError(403, "Internal detail"));
      mocks.get.mockRejectedValue(new GridoneError(403, "Internal detail"));
      for (const path of ["/drivers", "/drivers/item", "/drivers/item/edit"]) {
        mount(path, cached);
        expect(
          await screen.findByRole("heading", { name: "Access denied" }),
        ).toBeVisible();
        expect(
          screen.queryByRole("heading", { name: "item" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Internal detail/)).not.toBeInTheDocument();
        cleanup();
      }
    },
  );
  it.each(["/drivers/item", "/drivers/item/edit"])(
    "handles forbidden package metadata on %s",
    async (path) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.presentation.mockRejectedValue(
        new GridoneError(403, "Internal detail"),
      );
      mount(path, true);
      expect(
        await screen.findByRole("heading", { name: "Access denied" }),
      ).toBeVisible();
    },
  );
  it("recovers when navigating from a missing resource to an existing one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.get.mockImplementation(async (id: string) => {
      if (id === "missing") throw new GridoneError(404, "Not found");
      return resource;
    });
    const { router } = mount("/drivers/missing");
    expect(
      await screen.findByRole("heading", { name: "Not found" }),
    ).toBeVisible();
    await act(async () => router.navigate("/drivers/item"));
    expect(await screen.findByRole("heading", { name: "item" })).toBeVisible();
  });
});
