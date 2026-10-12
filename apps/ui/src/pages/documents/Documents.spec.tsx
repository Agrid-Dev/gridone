import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import type { Document } from "@gridone/sdk";

const { api, permissions, downloadBlob } = vi.hoisted(() => ({
  api: {
    documents: {
      uploadPolicy: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
    },
    assets: { list: vi.fn() },
    devices: { list: vi.fn() },
    users: { listRoles: vi.fn() },
  },
  permissions: new Set<string>(),
  downloadBlob: vi.fn(),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => api,
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) => permissions.has(permission),
}));
vi.mock("@/lib/download", () => ({ downloadBlob }));
vi.mock("react-i18next", async () =>
  createI18nMock((await import("@/locales/en/documents.json")).default),
);

import Documents from "./index";
import { DocumentsCard } from "./DocumentsCard";

const document: Document = {
  id: "doc",
  name: "Notice",
  filename: "notice.txt",
  media_type: "text/plain",
  size: 6,
  created_by: "admin",
  created_at: "2026-10-12T00:00:00Z",
  updated_at: "2026-10-12T00:00:00Z",
  allowed_role_ids: ["viewer"],
  asset_ids: [],
  device_ids: [],
};
const page = {
  items: [document],
  total: 1,
  page: 1,
  size: 50,
  total_pages: 1,
  links: {},
};
const policy = {
  max_file_bytes: 100,
  extensions: [".txt", ".pdf"],
  metadata_schema: {
    type: "object",
    required: ["name", "allowed_role_ids"],
    properties: {
      name: { type: "string", minLength: 1 },
      allowed_role_ids: { type: "array", items: { type: "string" } },
      asset_ids: { type: "array", items: { type: "string" } },
      device_ids: { type: "array", items: { type: "string" } },
    },
    additionalProperties: false,
  },
};

function setup(path = "/documents/new", card = false) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/documents/*" element={<Documents />} />
          <Route
            path="/asset"
            element={card && <DocumentsCard assetId="building" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

async function chooseVisibility(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(
    screen.getByRole("combobox", { name: "Who can read this document?" }),
  );
  await user.click(screen.getByRole("option", { name: label }));
}

beforeEach(() => {
  permissions.clear();
  ["documents:read", "documents:write", "assets:read", "devices:read"].forEach(
    (p) => permissions.add(p),
  );
  api.documents.uploadPolicy.mockResolvedValue(policy);
  api.documents.get.mockResolvedValue(document);
  api.documents.list.mockResolvedValue(page);
  api.documents.create.mockResolvedValue(document);
  api.documents.update.mockResolvedValue(document);
  api.documents.download.mockResolvedValue(new Blob(["notice"]));
  api.assets.list.mockResolvedValue([{ id: "building", name: "Building" }]);
  api.devices.list.mockResolvedValue([{ id: "boiler", name: "Boiler" }]);
  api.users.listRoles.mockResolvedValue([
    { id: "admin", name: "Admin", permissions: ["documents:read"] },
    { id: "viewer", name: "Viewer", permissions: ["documents:read"] },
    { id: "hidden", name: "Hidden", permissions: [] },
  ]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("documents", () => {
  it("requires an explicit audience and sends the selected file and prefilled asset", async () => {
    const user = setup("/documents/new?asset_id=building");
    const file = new File(["notice"], "notice.txt", { type: "text/plain" });
    await user.upload(await screen.findByLabelText(/^File/), file);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "notice.txt",
    );
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(api.documents.create).not.toHaveBeenCalled();
    await chooseVisibility(user, "Administrators only");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() =>
      expect(api.documents.create).toHaveBeenCalledWith(
        {
          name: "notice.txt",
          allowed_role_ids: [],
          asset_ids: ["building"],
          device_ids: [],
        },
        file,
        "notice.txt",
      ),
    );
  });

  it("keeps the form and file after failure and selects only currently eligible roles", async () => {
    api.documents.create.mockRejectedValueOnce(new Error("Offline"));
    const user = setup();
    const file = new File(["notice"], "notice.txt");
    await user.upload(await screen.findByLabelText(/^File/), file);
    await chooseVisibility(user, "Selected roles");
    await user.click(
      screen.getByRole("button", { name: "Select all current roles" }),
    );
    expect(
      screen.queryByRole("option", { name: "Hidden" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "notice.txt",
    );
    expect(
      (screen.getByLabelText(/^File/) as HTMLInputElement).files?.[0],
    ).toBe(file);
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(api.documents.create).toHaveBeenCalledTimes(2));
    expect(api.documents.create.mock.calls[1][0].allowed_role_ids).toEqual([
      "viewer",
    ]);
  });

  it("rejects an oversized file before sending it", async () => {
    const user = setup();
    await user.upload(
      await screen.findByLabelText(/^File/),
      new File(["x".repeat(101)], "large.txt"),
    );
    await chooseVisibility(user, "Administrators only");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(
      await screen.findByText(
        "The file is empty, too large, or its format is not supported.",
      ),
    ).toBeInTheDocument();
    expect(api.documents.create).not.toHaveBeenCalled();
  });

  it("renames without resubmitting an unavailable existing attachment", async () => {
    api.documents.get.mockResolvedValue({
      ...document,
      asset_ids: ["deleted"],
    });
    const user = setup("/documents/doc/edit");
    const name = await screen.findByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.documents.update).toHaveBeenCalledWith("doc", {
        name: "Renamed",
      }),
    );
  });

  it("searches and toggles roles and links using the shared multi-selects", async () => {
    const user = setup();
    const file = new File(["notice"], "notice.txt");
    await user.upload(await screen.findByLabelText(/^File/), file);
    await chooseVisibility(user, "Selected roles");
    await user.click(
      screen.getByRole("combobox", { name: "Authorized roles" }),
    );
    await user.type(screen.getByPlaceholderText("Search roles…"), "View");
    await user.click(screen.getByRole("option", { name: "Viewer" }));
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("combobox", { name: "Authorized roles" }),
    ).toHaveTextContent("Viewer");

    for (const [label, search, option] of [
      ["Assets", "Search assets…", "Building"],
      ["Devices", "Search devices…", "Boiler"],
    ]) {
      await user.click(screen.getByRole("combobox", { name: label }));
      await user.type(screen.getByPlaceholderText(search), option);
      await user.click(screen.getByRole("option", { name: option }));
      await user.keyboard("{Escape}");
    }
    await user.click(screen.getByRole("combobox", { name: "Assets" }));
    await user.click(screen.getByRole("option", { name: "Building" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() =>
      expect(api.documents.create).toHaveBeenCalledWith(
        {
          name: "notice.txt",
          allowed_role_ids: ["viewer"],
          asset_ids: [],
          device_ids: ["boiler"],
        },
        file,
        "notice.txt",
      ),
    );
  });

  it("lets a reader download while hiding write actions and forbidden resource links", async () => {
    permissions.delete("documents:write");
    permissions.delete("assets:read");
    permissions.delete("devices:read");
    api.documents.get.mockResolvedValue({
      ...document,
      asset_ids: ["building"],
    });
    const user = setup("/documents/doc");
    await user.click(await screen.findByRole("button", { name: "Download" }));
    await waitFor(() =>
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "notice.txt"),
    );
    expect(
      screen.queryByRole("link", { name: "Edit document" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Building" }),
    ).not.toBeInTheDocument();
    expect(api.assets.list).not.toHaveBeenCalled();
  });

  it("links the asset card to filtered listing and upload", async () => {
    setup("/asset", true);
    expect(
      await screen.findByRole("link", { name: "Notice" }),
    ).toBeInTheDocument();
    expect(api.documents.list).toHaveBeenCalledWith({
      asset_id: "building",
      device_id: undefined,
      size: 5,
    });
    expect(screen.getByRole("link", { name: "Add document" })).toHaveAttribute(
      "href",
      "/documents/new?asset_id=building",
    );
    expect(
      screen.getByRole("link", { name: "See all documents" }),
    ).toHaveAttribute("href", "/documents?asset_id=building");
  });
});
