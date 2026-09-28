import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GridoneError } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import Automations from "./index";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  list: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    mocks.permissions.has(permission),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ automations: { list: mocks.list } }),
}));
vi.mock("./AutomationPage/AutomationPage", () => ({
  default: () => {
    mocks.detail();
    return <div>Automation detail</div>;
  },
}));
vi.mock("./NewAutomationPage", () => ({
  default: () => {
    mocks.create();
    return <div>Automation creation</div>;
  },
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    "errors.forbidden": "Access denied",
    "errors.forbiddenDescription":
      "You do not have permission to access this page.",
    "errors.default": "Something went wrong",
    "empty.title": "No automations yet",
    "actions.create": "New automation",
  }),
);

function mount(path: string, cached = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (cached) client.setQueryData(["automations"], []);
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/automations/*" element={<Automations />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(tree());
  return { refresh: () => result.rerender(tree()) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions = new Set(["automations:read", "automations:write"]);
  mocks.list.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("automation route permissions", () => {
  it.each(["/automations", "/automations/a1", "/automations/new"])(
    "blocks direct access to %s without read permission, even with write permission and cached data",
    async (path) => {
      mocks.permissions.delete("automations:read");
      mount(path, true);
      expect(
        await screen.findByRole("heading", { name: "Access denied" }),
      ).toBeVisible();
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.detail).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
      expect(screen.queryByText("No automations yet")).not.toBeInTheDocument();
    },
  );

  it("blocks the creation URL for a read-only user", async () => {
    mocks.permissions.delete("automations:write");
    mount("/automations/new");
    expect(
      await screen.findByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("lets a reader open the list without offering creation", async () => {
    mocks.permissions.delete("automations:write");
    mount("/automations");
    expect(await screen.findByText("No automations yet")).toBeVisible();
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("link", { name: "New automation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "empty.create.automations" }),
    ).not.toBeInTheDocument();
  });

  it("lets a reader open a detail URL", async () => {
    mocks.permissions.delete("automations:write");
    mount("/automations/a1");
    expect(await screen.findByText("Automation detail")).toBeVisible();
  });

  it("lets a writer open the creation URL", async () => {
    mount("/automations/new");
    expect(await screen.findByText("Automation creation")).toBeVisible();
  });

  it("unmounts the list when read permission is revoked", async () => {
    const { refresh } = mount("/automations");
    await screen.findByText("No automations yet");
    mocks.permissions.clear();
    refresh();
    expect(
      screen.getByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
    expect(screen.queryByText("No automations yet")).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "shows access denied on an API 403 instead of an empty or cached list (cached: %s)",
    async (cached) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.list.mockRejectedValue(new GridoneError(403, "Server detail"));
      mount("/automations", cached);
      expect(
        await screen.findByRole("heading", { name: "Access denied" }),
      ).toBeVisible();
      expect(screen.queryByText("No automations yet")).not.toBeInTheDocument();
      expect(screen.queryByText(/Server detail/)).not.toBeInTheDocument();
    },
  );

  it("shows a loading error rather than an empty list for other API failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.list.mockRejectedValue(new GridoneError(500, "Server detail"));
    mount("/automations");
    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeVisible(),
    );
    expect(screen.queryByText("No automations yet")).not.toBeInTheDocument();
  });
});
