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
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
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
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("documents", () => {
  it("sends the selected file and prefilled asset without requiring a sharing choice", async () => {
    const user = setup("/documents/new?asset_id=building");
    const file = new File(["notice"], "notice.txt", { type: "text/plain" });
    await user.upload(await screen.findByLabelText(/^File/), file);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "notice.txt",
    );
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() =>
      expect(api.documents.create).toHaveBeenCalledWith(
        {
          name: "notice.txt",
          asset_ids: ["building"],
          device_ids: [],
        },
        file,
        "notice.txt",
      ),
    );
  });

  it("keeps the form and file after a failed upload", async () => {
    api.documents.create.mockRejectedValueOnce(new Error("Offline"));
    const user = setup();
    const file = new File(["notice"], "notice.txt");
    await user.upload(await screen.findByLabelText(/^File/), file);
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
  });

  it("rejects an oversized file before sending it", async () => {
    const user = setup();
    await user.upload(
      await screen.findByLabelText(/^File/),
      new File(["x".repeat(101)], "large.txt"),
    );
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

  it("searches and toggles asset and device links using the shared multi-selects", async () => {
    const user = setup();
    const file = new File(["notice"], "notice.txt");
    await user.upload(await screen.findByLabelText(/^File/), file);
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

  it("keeps filters while paging and resets the page when filters change", async () => {
    api.documents.list.mockImplementation(async (params) => ({
      ...page,
      page: params.page,
      total: 101,
      total_pages: 3,
    }));
    const user = setup("/documents?q=Notice&asset_id=building&page=2");
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(api.documents.list).toHaveBeenLastCalledWith({
        q: "Notice",
        asset_id: "building",
        device_id: undefined,
        page: 3,
      }),
    );
    expect(await screen.findByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByRole("combobox", { name: "Devices" }));
    await user.click(await screen.findByRole("option", { name: "Boiler" }));
    await waitFor(() =>
      expect(api.documents.list).toHaveBeenLastCalledWith({
        q: "Notice",
        asset_id: "building",
        device_id: "boiler",
        page: 1,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(api.documents.list).toHaveBeenLastCalledWith({
        q: undefined,
        asset_id: undefined,
        device_id: undefined,
        page: 1,
      }),
    );
    expect(
      screen.getByRole("searchbox", { name: "Search documents" }),
    ).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Assets" })).toHaveTextContent(
      "All assets",
    );
    expect(screen.getByRole("combobox", { name: "Devices" })).toHaveTextContent(
      "All devices",
    );
  });

  it("opens a document and downloads its original filename from the list", async () => {
    permissions.delete("documents:write");
    const user = setup("/documents");
    expect(await screen.findByRole("link", { name: "Notice" })).toHaveAttribute(
      "href",
      "/documents/doc",
    );
    expect(
      screen.queryByRole("link", { name: "Add document" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download Notice" }));
    await waitFor(() =>
      expect(api.documents.download).toHaveBeenCalledWith("doc"),
    );
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "notice.txt");
  });
});
