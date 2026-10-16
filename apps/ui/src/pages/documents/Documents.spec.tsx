import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ComponentProps } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { createI18nMock } from "@/test/i18nMock";
import {
  GridoneError,
  type Document,
  type DocumentUploadPolicy,
  type Folder,
} from "@gridone/sdk";

const { api, permissions, downloadBlob, openBlankTab, showBlob, toast, dnd } =
  vi.hoisted(() => ({
    api: {
      documents: {
        uploadPolicy: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        get: vi.fn(),
        list: vi.fn(),
        download: vi.fn(),
        delete: vi.fn(),
        listFolders: vi.fn(),
        createFolder: vi.fn(),
        updateFolder: vi.fn(),
        deleteFolder: vi.fn(),
      },
      assets: { list: vi.fn() },
      devices: { listAll: vi.fn() },
    },
    permissions: new Set<string>(),
    downloadBlob: vi.fn(),
    openBlankTab: vi.fn(),
    showBlob: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
    /** The drag-and-drop context, kept real, with its drop handler in reach. */
    dnd: {
      onDragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
    },
  }));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => api,
}));
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) => permissions.has(permission),
}));
vi.mock("@/lib/download", () => ({ downloadBlob, openBlankTab, showBlob }));
vi.mock("sonner", () => ({ toast }));
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
const policy: DocumentUploadPolicy = {
  max_file_bytes: 100,
  extensions: [".txt", ".pdf"],
};

/** *hidden_by* is what the server reports: the folder itself when archived. */
function folder(
  id: string,
  name: string,
  parent_id: string | null = null,
  archived_at: string | null = null,
  hidden_by: string | null = archived_at ? id : null,
): Folder {
  return {
    id,
    name,
    parent_id,
    archived_at,
    hidden_by,
    created_by: "admin",
    created_at: "2026-10-12T00:00:00Z",
    updated_at: "2026-10-12T00:00:00Z",
  };
}
const plans = folder("plans", "Plans");
const old = folder("old", "Old", null, "2026-10-13T00:00:00Z");

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
  api.documents.listFolders.mockResolvedValue([]);
  api.documents.createFolder.mockResolvedValue(plans);
  api.documents.updateFolder.mockResolvedValue(plans);
  api.assets.list.mockResolvedValue([{ id: "building", name: "Building" }]);
  api.devices.listAll.mockResolvedValue([{ id: "boiler", name: "Boiler" }]);
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
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "  Notice  ");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() =>
      expect(api.documents.create).toHaveBeenCalledWith(
        {
          name: "Notice",
          folder_id: null,
          asset_ids: ["building"],
          device_ids: [],
        },
        file,
        "notice.txt",
      ),
    );
  });

  it.each(["   ", "x".repeat(256)])(
    "rejects an invalid name before uploading: %j",
    async (value) => {
      const user = setup();
      await user.upload(
        await screen.findByLabelText(/^File/),
        new File(["notice"], "notice.txt"),
      );
      const name = screen.getByRole("textbox", { name: "Name" });
      await user.clear(name);
      await user.type(name, value);
      await user.click(screen.getByRole("button", { name: "Upload" }));
      await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
      expect(api.documents.create).not.toHaveBeenCalled();
    },
  );

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
      ["Zones", "Search zones…", "Building"],
      ["Devices", "Search devices…", "Boiler"],
    ]) {
      await user.click(screen.getByRole("combobox", { name: label }));
      await user.type(screen.getByPlaceholderText(search), option);
      await user.click(screen.getByRole("option", { name: option }));
      await user.keyboard("{Escape}");
    }
    await user.click(screen.getByRole("combobox", { name: "Zones" }));
    await user.click(screen.getByRole("option", { name: "Building" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() =>
      expect(api.documents.create).toHaveBeenCalledWith(
        {
          name: "notice.txt",
          folder_id: null,
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
    // Without a search, the page browses the top level again.
    await waitFor(() =>
      expect(api.documents.list).toHaveBeenLastCalledWith({
        top_level: true,
        page: 1,
      }),
    );
    expect(
      screen.getByRole("searchbox", { name: "Search documents" }),
    ).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Zones" })).toHaveTextContent(
      "All zones",
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

describe("document folders", () => {
  const level2 = folder("level2", "Level 2", "plans");
  const level10 = folder("level10", "Level 10", "plans");

  it("browses the top level with its active folders above its documents", async () => {
    api.documents.listFolders.mockResolvedValue([old, level2, plans]);
    setup("/documents");
    const folderLink = await screen.findByRole("link", { name: "Plans" });
    expect(folderLink).toHaveAttribute("href", "/documents?folder=plans");
    expect(api.documents.list).toHaveBeenCalledWith({
      top_level: true,
      page: 1,
    });
    expect(screen.queryByRole("link", { name: "Old" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Level 2" }),
    ).not.toBeInTheDocument();
    const notice = screen.getByRole("link", { name: "Notice" });
    expect(
      folderLink.compareDocumentPosition(notice) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens a folder with its breadcrumb and files new folders and documents in it", async () => {
    api.documents.listFolders.mockResolvedValue([plans, level10, level2]);
    const user = setup("/documents?folder=plans");
    const breadcrumb = await screen.findByRole("navigation", {
      name: "Folders",
    });
    // The parents lead up to the title, which names the open folder.
    expect(
      await within(breadcrumb).findByRole("link", { name: "Documents" }),
    ).toHaveAttribute("href", "/documents");
    expect(within(breadcrumb).queryByText("Plans")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plans" })).toBeInTheDocument();
    expect(
      screen.queryByText("Technical files and notices for your building."),
    ).not.toBeInTheDocument();
    expect(api.documents.list).toHaveBeenCalledWith({
      folder_id: "plans",
      page: 1,
    });
    const second = await screen.findByRole("link", { name: "Level 2" });
    expect(
      second.compareDocumentPosition(
        screen.getByRole("link", { name: "Level 10" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add document" })).toHaveAttribute(
      "href",
      "/documents/new?folder=plans",
    );
    await user.click(screen.getByRole("button", { name: "New folder" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Folder name" }),
      "  Level 3 ",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(api.documents.createFolder).toHaveBeenCalledWith({
        name: "Level 3",
        parent_id: "plans",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("renames, archives and deletes a folder from its menu, refusing a non-empty one", async () => {
    api.documents.listFolders.mockResolvedValue([plans]);
    const user = setup("/documents");
    await user.click(
      await screen.findByRole("button", { name: "Actions for Plans" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const name = await screen.findByRole("textbox", { name: "Folder name" });
    expect(name).toHaveValue("Plans");
    await user.clear(name);
    await user.type(name, "Plans v2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.documents.updateFolder).toHaveBeenCalledWith("plans", {
        name: "Plans v2",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Actions for Plans" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
    await waitFor(() =>
      expect(api.documents.updateFolder).toHaveBeenLastCalledWith("plans", {
        archived: true,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Folder archived with its contents. Find it in the archives.",
    );

    api.documents.deleteFolder.mockRejectedValueOnce(
      new GridoneError(409, "The folder is not empty."),
    );
    await user.click(screen.getByRole("button", { name: "Actions for Plans" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Delete Plans?")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "This folder is not empty. Move or delete its contents first, archived items included, or archive the folder instead.",
    );
    expect(api.documents.deleteFolder).toHaveBeenCalledWith("plans");
  });

  it("lists every archived folder and document in the archives, with where it is filed", async () => {
    const archivedChild = folder(
      "oldchild",
      "Old child",
      "old",
      "2026-10-14T00:00:00Z",
    );
    api.documents.listFolders.mockResolvedValue([plans, old, archivedChild]);
    api.documents.list.mockResolvedValue({
      ...page,
      items: [
        {
          ...document,
          folder_id: "plans",
          archived_at: "2026-10-14T00:00:00Z",
        },
      ],
    });
    setup("/documents?archived=1");
    expect(
      await screen.findByRole("link", { name: "Old child" }),
    ).toHaveAttribute("href", "/documents?folder=oldchild");
    expect(api.documents.list).toHaveBeenCalledWith({
      archived: true,
      q: undefined,
      asset_id: undefined,
      device_id: undefined,
      page: 1,
    });
    expect(
      screen.getByText((_, element) => element?.textContent === "In Old"),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === "In Plans"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Plans" }).map((l) => l.textContent),
    ).toEqual(["Plans"]);
    expect(
      screen.queryByRole("navigation", { name: "Folders" }),
    ).not.toBeInTheDocument();
  });

  it("opens a folder an archived folder hides read-only, with a way to restore it", async () => {
    api.documents.listFolders.mockResolvedValue([
      old,
      folder("oldchild", "Old child", "old", null, "old"),
    ]);
    const user = setup("/documents?folder=oldchild");
    expect(await screen.findByText("Archived folder")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New folder" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add document" })).toHaveAttribute(
      "href",
      "/documents/new",
    );
    await user.click(screen.getByRole("button", { name: "Restore Old" }));
    await waitFor(() =>
      expect(api.documents.updateFolder).toHaveBeenCalledWith("old", {
        archived: false,
      }),
    );
  });

  it("moves a dragged document onto a folder or back to the top level", async () => {
    const filed = { ...document, folder_id: "plans" };
    api.documents.listFolders.mockResolvedValue([plans]);
    api.documents.list.mockResolvedValue({ ...page, items: [filed] });
    setup("/documents?folder=plans");
    await screen.findByRole("link", { name: "Notice" });
    const drop = (over: unknown) =>
      act(() =>
        dnd.onDragEnd!({
          active: {
            id: "document:doc",
            data: { current: { document: filed } },
          },
          over,
        } as unknown as DragEndEvent),
      );
    drop({ id: "folder:plans", data: { current: { folder: plans } } });
    drop(null);
    expect(api.documents.update).not.toHaveBeenCalled();
    drop({ id: "top-level", data: { current: { folder: null } } });
    await waitFor(() =>
      expect(api.documents.update).toHaveBeenCalledWith("doc", {
        folder_id: null,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Document moved to Documents.");
  });

  it("opens viewable files in a new tab and only downloads office files", async () => {
    const report = {
      ...document,
      id: "report",
      name: "Report",
      filename: "report.docx",
      media_type:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    api.documents.list.mockResolvedValue({
      ...page,
      items: [document, report],
    });
    const tab = { closed: false };
    openBlankTab.mockReturnValue(tab);
    const user = setup("/documents");
    await user.click(
      await screen.findByRole("button", { name: "Open Notice" }),
    );
    await waitFor(() =>
      expect(showBlob).toHaveBeenCalledWith(
        tab,
        expect.any(Blob),
        "text/plain;charset=utf-8",
        "notice.txt",
      ),
    );
    expect(openBlankTab).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Open Report" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download Report" }),
    ).toBeInTheDocument();
  });

  it("files a new document in the folder it was added from and moves it from the form", async () => {
    api.documents.listFolders.mockResolvedValue([plans]);
    const user = setup("/documents/new?folder=plans");
    const file = new File(["notice"], "notice.txt");
    await user.upload(await screen.findByLabelText(/^File/), file);
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/documents?folder=plans",
    );
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() =>
      expect(api.documents.create).toHaveBeenCalledWith(
        expect.objectContaining({ folder_id: "plans" }),
        file,
        "notice.txt",
      ),
    );
    cleanup();

    api.documents.get.mockResolvedValue({ ...document, folder_id: "plans" });
    const editor = setup("/documents/doc/edit");
    await editor.click(await screen.findByRole("combobox", { name: "Folder" }));
    await editor.click(
      await screen.findByRole("option", { name: "No folder" }),
    );
    await editor.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.documents.update).toHaveBeenCalledWith("doc", {
        folder_id: null,
      }),
    );
  });
});

describe("document folders, independent spec", () => {
  const level2 = folder("level2", "Level 2", "plans");
  const oldChild = folder("oldchild", "Old child", "old", null, "old");
  const oldOther = folder("oldother", "Old other", "old", null, "old");

  it("clears a search back to the folder it was started from", async () => {
    api.documents.listFolders.mockResolvedValue([plans]);
    const user = setup("/documents?folder=plans&q=Notice");
    await screen.findByRole("link", { name: "Notice" });
    expect(api.documents.list).toHaveBeenLastCalledWith({
      q: "Notice",
      asset_id: undefined,
      device_id: undefined,
      page: 1,
    });
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(api.documents.list).toHaveBeenLastCalledWith({
        folder_id: "plans",
        page: 1,
      }),
    );
  });

  it("clears a search in the archives without leaving them", async () => {
    const user = setup("/documents?archived=1&q=Notice");
    await screen.findByRole("link", { name: "Notice" });
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(api.documents.list).toHaveBeenLastCalledWith({
        archived: true,
        q: undefined,
        asset_id: undefined,
        device_id: undefined,
        page: 1,
      }),
    );
    expect(api.documents.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ top_level: true }),
    );
  });

  it("searches across folders: no folder rows, each result says where it is filed", async () => {
    api.documents.listFolders.mockResolvedValue([plans, level2]);
    api.documents.list.mockResolvedValue({
      ...page,
      items: [{ ...document, folder_id: "level2" }],
    });
    setup("/documents?q=Notice");
    expect(
      await screen.findByRole("link", { name: "Plans › Level 2" }),
    ).toHaveAttribute("href", "/documents?folder=level2");
    expect(
      screen.queryByRole("link", { name: "Plans" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Folders" }),
    ).not.toBeInTheDocument();
  });

  it("opens the tab within the click, before the file arrives", async () => {
    let arrive: (blob: Blob) => void = () => {};
    api.documents.download.mockReturnValue(
      new Promise<Blob>((resolve) => (arrive = resolve)),
    );
    const tab = { closed: false, close: vi.fn() };
    openBlankTab.mockReturnValue(tab);
    const user = setup("/documents");
    await user.click(
      await screen.findByRole("button", { name: "Open Notice" }),
    );
    await waitFor(() =>
      expect(api.documents.download).toHaveBeenCalledWith("doc"),
    );
    expect(openBlankTab).toHaveBeenCalledTimes(1);
    expect(showBlob).not.toHaveBeenCalled();
    await act(async () => arrive(new Blob(["notice"])));
    await waitFor(() =>
      expect(showBlob).toHaveBeenCalledWith(
        tab,
        expect.any(Blob),
        "text/plain;charset=utf-8",
        "notice.txt",
      ),
    );
    expect(tab.close).not.toHaveBeenCalled();
  });

  it("closes the opened tab and says so when the file cannot be fetched", async () => {
    api.documents.download.mockRejectedValue(new Error("Offline"));
    const tab = { closed: false, close: vi.fn() };
    openBlankTab.mockReturnValue(tab);
    const user = setup("/documents");
    await user.click(
      await screen.findByRole("button", { name: "Open Notice" }),
    );
    await waitFor(() => expect(tab.close).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(
      "Unable to complete the operation. Please try again.",
    );
    expect(showBlob).not.toHaveBeenCalled();
  });

  it("keeps the server's wording for a refused document deletion", async () => {
    api.documents.delete.mockRejectedValueOnce(
      new GridoneError(409, "Document is locked."),
    );
    const user = setup("/documents");
    await user.click(
      await screen.findByRole("button", { name: "Actions for Notice" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "Document is locked.",
    );
  });

  it("keeps the server's wording when a folder deletion is refused for another reason", async () => {
    api.documents.listFolders.mockResolvedValue([plans]);
    api.documents.deleteFolder.mockRejectedValueOnce(
      new GridoneError(403, "Only integrators delete folders."),
    );
    const user = setup("/documents");
    await user.click(
      await screen.findByRole("button", { name: "Actions for Plans" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "Only integrators delete folders.",
    );
  });

  it("offers a document's hidden folder, marked archived, and no other hidden folder", async () => {
    api.documents.listFolders.mockResolvedValue([
      plans,
      old,
      oldChild,
      oldOther,
    ]);
    api.documents.get.mockResolvedValue({ ...document, folder_id: "oldchild" });
    const user = setup("/documents/doc/edit");
    await user.click(await screen.findByRole("combobox", { name: "Folder" }));
    const options = (await screen.findAllByRole("option")).map(
      (option) => option.textContent,
    );
    expect(options).toEqual([
      "No folder",
      "Old › Old child (archived)",
      "Plans",
    ]);
  });

  // Until the folders load, nobody knows whether an archived folder hides this
  // one: « New folder » and a pre-filed « Add document » must wait.
  it("keeps a folder read-only until the folders say whether it is hidden", async () => {
    api.documents.listFolders.mockReturnValue(new Promise(() => {}));
    setup("/documents?folder=oldchild");
    await screen.findByRole("link", { name: "Notice" });
    expect(
      screen.queryByRole("button", { name: "New folder" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add document" })).toHaveAttribute(
      "href",
      "/documents/new",
    );
  });
});

describe("archives search", () => {
  it("lists only the archived folders whose name matches, and none for a link filter", async () => {
    api.documents.listFolders.mockResolvedValue([
      old,
      folder("plans-old", "Plans 2024", null, "2026-10-14T00:00:00Z"),
    ]);
    api.documents.list.mockResolvedValue({ ...page, items: [], total: 0 });
    setup("/documents?archived=1&q=plans");
    expect(
      await screen.findByRole("link", { name: "Plans 2024" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Old" })).not.toBeInTheDocument();
    cleanup();

    setup("/documents?archived=1&asset_id=building");
    expect(await screen.findByText("No archives")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Plans 2024" }),
    ).not.toBeInTheDocument();
  });
});
