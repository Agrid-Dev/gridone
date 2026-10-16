import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  Document,
  DocumentCreate,
  DocumentListParams,
  DocumentUpdate,
  Folder,
  FolderCreate,
  FolderUpdate,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import { downloadBlob, openBlankTab, showBlob } from "@/lib/download";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import {
  hidingFolder,
  archivedFolders,
  childFolders,
  folderPath,
  indexFolders,
} from "./folderTree";

export const documentsKey = ["documents"] as const;

export function useDocuments(params: DocumentListParams) {
  const client = useGridoneClient();
  return useQuery({
    queryKey: [...documentsKey, "list", params],
    queryFn: () => client.documents.list(params),
    throwOnError: true,
  });
}

/** Every folder, archived ones included: the page builds paths and views from
 *  the whole tree. Kept under `documentsKey` so one refresh covers both. */
export function useDocumentFolders() {
  const client = useGridoneClient();
  return useQuery({
    queryKey: [...documentsKey, "folders"],
    queryFn: () => client.documents.listFolders(),
    throwOnError: true,
  });
}

export function useDocumentFromRoute() {
  const { documentId } = useParams();
  const client = useGridoneClient();
  if (!documentId) throw new Error("Missing documentId route parameter");
  return useSuspenseQuery({
    queryKey: [...documentsKey, documentId],
    queryFn: () => client.documents.get(documentId),
  }).data;
}

export function useDocumentChoices() {
  const client = useGridoneClient();
  const can = usePermissions();
  const assets = useQuery({
    queryKey: ["document-choices", "assets"],
    queryFn: () => client.assets.list(),
    enabled: can("assets:read"),
    throwOnError: true,
  });
  const devices = useQuery({
    queryKey: ["document-choices", "devices"],
    queryFn: () => client.devices.listAll(),
    enabled: can("devices:read"),
    throwOnError: true,
  });
  return {
    assets: (assets.data ?? []).map((a) => ({ id: a.id, name: a.name })),
    devices: (devices.data ?? []).map((d) => ({
      id: d.id,
      name: d.name || d.id,
    })),
    loading: assets.isLoading || devices.isLoading,
  };
}

export function useDocumentUploadPolicy() {
  const client = useGridoneClient();
  return useSuspenseQuery({
    queryKey: [...documentsKey, "upload-policy"],
    queryFn: () => client.documents.uploadPolicy(),
  }).data;
}

/** The type a browser displays a document as, or undefined when it cannot
 *  (DOCX, XLSX): those are only downloaded. Text shows as plain text, CSV
 *  included, since browsers download `text/csv` instead of showing it. */
export function viewableType(document: Document): string | undefined {
  return VIEWABLE_TYPES[document.media_type];
}

const VIEWABLE_TYPES: Record<string, string> = {
  "application/pdf": "application/pdf",
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "text/plain": "text/plain;charset=utf-8",
  "text/csv": "text/plain;charset=utf-8",
};

export function useDocumentActions() {
  const client = useGridoneClient();
  const cache = useQueryClient();
  const { t } = useTranslation("documents");
  const onError = (error: Error) =>
    toast.error(serverErrorMessage(error) || t("error"));
  const invalidate = () => cache.invalidateQueries({ queryKey: documentsKey });
  const create = useMutation({
    mutationFn: ({
      metadata,
      file,
    }: {
      metadata: DocumentCreate;
      file: File;
    }) => client.documents.create(metadata, file, file.name),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DocumentUpdate }) =>
      client.documents.update(id, patch),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.documents.delete(id),
    onSuccess: async (_data, id) => {
      cache.removeQueries({ queryKey: [...documentsKey, id], exact: true });
      await invalidate();
    },
  });
  const download = useMutation({
    mutationFn: async (document: Document) =>
      downloadBlob(
        await client.documents.download(document.id),
        document.filename,
      ),
    onError,
  });
  const view = useMutation({
    mutationFn: async ({
      document,
      tab,
    }: {
      document: Document;
      tab: Window | null;
    }) =>
      showBlob(
        tab,
        await client.documents.download(document.id),
        viewableType(document) ?? document.media_type,
        document.filename,
      ),
    onError: (error: Error, { tab }) => {
      tab?.close();
      onError(error);
    },
  });
  const archive = useMutation({
    mutationFn: ({ item, archived }: ArchiveRequest<Document>) =>
      client.documents.update(item.id, { archived }),
    onSuccess: async (_data, { item, archived }) => {
      toast.success(
        t(archived ? "archivedDocument" : "restoredDocument", {
          name: item.name,
        }),
      );
      await invalidate();
    },
    onError,
  });
  const move = useMutation({
    mutationFn: ({ document, folder }: MoveRequest) =>
      client.documents.update(document.id, { folder_id: folder?.id ?? null }),
    onSuccess: async (_data, { document, folder }) => {
      toast.success(
        t("moved", { name: document.name, folder: folder?.name ?? t("title") }),
      );
      await invalidate();
    },
    onError,
  });
  /** Opens the tab within the click, before the file is fetched. */
  const open = (document: Document) =>
    view.mutate({ document, tab: openBlankTab() });
  return { create, update, remove, download, view, open, archive, move };
}

export interface ArchiveRequest<T> {
  item: T;
  archived: boolean;
}

export interface MoveRequest {
  document: Document;
  /** Null moves the document to the top level. */
  folder: Folder | null;
}

export function useFolderActions() {
  const client = useGridoneClient();
  const cache = useQueryClient();
  const { t } = useTranslation("documents");
  const invalidate = () => cache.invalidateQueries({ queryKey: documentsKey });
  const create = useMutation({
    mutationFn: (body: FolderCreate) => client.documents.createFolder(body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: FolderUpdate }) =>
      client.documents.updateFolder(id, patch),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: ({ item, archived }: ArchiveRequest<Folder>) =>
      client.documents.updateFolder(item.id, { archived }),
    onSuccess: async (_data, { item, archived }) => {
      toast.success(
        t(archived ? "archivedFolder" : "restoredFolder", { name: item.name }),
      );
      await invalidate();
    },
    onError: (error: Error) =>
      toast.error(serverErrorMessage(error) || t("error")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.documents.deleteFolder(id),
    onSuccess: invalidate,
  });
  return { create, update, archive, remove };
}

/** What the documents page shows: a folder's contents, search results across
 *  folders, or the archives. */
export type DocumentsView = "browse" | "search" | "archives";

export interface DocumentFilterValues {
  q?: string;
  asset_id?: string;
  device_id?: string;
  page: number;
}

/** The list request for a view. Browsing asks for one folder's direct
 *  contents (`top_level` for the top); searching spans every folder; the
 *  archives list archived documents wherever they are filed. */
export function documentListParams(
  view: DocumentsView,
  folderId: string | null,
  { q, asset_id, device_id, page }: DocumentFilterValues,
): DocumentListParams {
  if (view === "archives")
    return { archived: true, q, asset_id, device_id, page };
  if (view === "search") return { q, asset_id, device_id, page };
  return folderId ? { folder_id: folderId, page } : { top_level: true, page };
}

export function useDocumentFilters() {
  const [search, setSearch] = useSearchParams();
  const rawPage = Number(search.get("page"));
  const filters: DocumentFilterValues = {
    q: search.get("q") || undefined,
    asset_id: search.get("asset_id") || undefined,
    device_id: search.get("device_id") || undefined,
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
  const folderId = search.get("folder") || null;
  const view: DocumentsView =
    search.get("archived") === "1"
      ? "archives"
      : filters.q || filters.asset_id || filters.device_id
        ? "search"
        : "browse";
  function update(change: (next: URLSearchParams) => void) {
    setSearch(
      (previous) => {
        const next = new URLSearchParams(previous);
        change(next);
        return next;
      },
      { replace: true },
    );
  }
  function setFilter(
    key: "q" | "asset_id" | "device_id" | "page",
    value: string,
  ) {
    update((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
    });
  }
  function showArchives(archives: boolean) {
    update((next) => {
      if (archives) next.set("archived", "1");
      else next.delete("archived");
      next.delete("page");
    });
  }
  /** Clears the search and filters; the folder and the view stay. */
  function clear() {
    update((next) => {
      for (const key of ["q", "asset_id", "device_id", "page"])
        next.delete(key);
    });
  }
  return {
    params: documentListParams(view, folderId, filters),
    filters,
    folderId,
    view,
    setFilter,
    showArchives,
    clear,
  };
}

/** The documents page state: the view, where it stands in the folder tree,
 *  and what may be filed there. A folder that an archived folder hides opens
 *  read-only: nothing new lands in it, by upload, creation or drag. */
export function useDocumentsBrowser() {
  const filtering = useDocumentFilters();
  const can = usePermissions();
  const query = useDocumentFolders();
  const folders = useMemo(() => query.data ?? [], [query.data]);
  const index = useMemo(() => indexFolders(folders), [folders]);
  const { view, folderId } = filtering;
  const browsing = view === "browse";
  const hiddenBy = browsing ? hidingFolder(folderId, index) : undefined;
  return {
    ...filtering,
    index,
    /** Empty at the top level, where the page title already says where it is. */
    path: browsing ? folderPath(folderId, index) : [],
    missingFolder:
      browsing && !!folderId && query.isSuccess && !index.has(folderId),
    hiddenBy,
    // A folder stays read-only until the tree says whether it is hidden.
    canFile:
      can("documents:write") &&
      browsing &&
      !hiddenBy &&
      (!folderId || query.isSuccess),
    folderRows:
      view === "archives"
        ? archivedFolders(folders).filter((folder) =>
            matchesSearch(folder, filtering.filters),
          )
        : browsing
          ? childFolders(folderId, folders)
          : [],
  };
}

/** Whether a folder answers the archives' search like a document would: by
 *  name; folders carry no asset or device link, so those filters leave them
 *  out. */
function matchesSearch(
  folder: Folder,
  { q, asset_id, device_id }: DocumentFilterValues,
) {
  return (
    !asset_id &&
    !device_id &&
    folder.name.toLowerCase().includes((q ?? "").toLowerCase())
  );
}

/** Where a folder opens: its contents, whatever was searched before. */
export function folderLink(folderId: string | null) {
  return folderId
    ? `/documents?folder=${encodeURIComponent(folderId)}`
    : "/documents";
}

export function documentSize(bytes: number, locale: string) {
  const unit =
    bytes < 1024 ? "byte" : bytes < 1024 * 1024 ? "kilobyte" : "megabyte";
  const divisor =
    unit === "byte" ? 1 : unit === "kilobyte" ? 1024 : 1024 * 1024;
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    maximumFractionDigits: 2,
  }).format(bytes / divisor);
}
