import type { RequestFn } from "../http/httpClient";
import type {
  Document,
  DocumentCreate,
  DocumentUpdate,
  DocumentUploadPolicy,
  Folder,
  FolderCreate,
  FolderUpdate,
  Page,
} from "../types";

export interface DocumentListParams {
  q?: string;
  /** Only the documents filed directly in this folder. */
  folder_id?: string;
  /** Only the documents filed in no folder. */
  top_level?: boolean;
  /** Archived documents instead of active ones. */
  archived?: boolean;
  asset_id?: string;
  device_id?: string;
  page?: number;
  size?: number;
}

export class DocumentsResource {
  constructor(private readonly request: RequestFn) {}

  list(params?: DocumentListParams): Promise<Page<Document>> {
    return this.request("GET", "/documents", { searchParams: { ...params } });
  }

  uploadPolicy(): Promise<DocumentUploadPolicy> {
    return this.request("GET", "/documents/upload-policy");
  }

  get(id: string): Promise<Document> {
    return this.request("GET", `/documents/${encodeURIComponent(id)}`);
  }

  create(
    metadata: DocumentCreate,
    file: Blob,
    filename: string,
  ): Promise<Document> {
    const form = new FormData();
    form.append("name", metadata.name);
    // FormData would send null as the string "null": omit it for the top level.
    if (metadata.folder_id) form.append("folder_id", metadata.folder_id);
    for (const id of metadata.asset_ids ?? []) form.append("asset_ids", id);
    for (const id of metadata.device_ids ?? []) form.append("device_ids", id);
    form.append("file", file, filename);
    return this.request("POST", "/documents", { body: form });
  }

  update(id: string, patch: DocumentUpdate): Promise<Document> {
    return this.request("PATCH", `/documents/${encodeURIComponent(id)}`, {
      body: patch,
    });
  }

  download(id: string): Promise<Blob> {
    return this.request("GET", `/documents/${encodeURIComponent(id)}/content`, {
      responseType: "blob",
    });
  }

  delete(id: string): Promise<void> {
    return this.request("DELETE", `/documents/${encodeURIComponent(id)}`);
  }

  listFolders(): Promise<Folder[]> {
    return this.request("GET", "/documents/folders");
  }

  createFolder(body: FolderCreate): Promise<Folder> {
    return this.request("POST", "/documents/folders", { body });
  }

  updateFolder(id: string, patch: FolderUpdate): Promise<Folder> {
    return this.request(
      "PATCH",
      `/documents/folders/${encodeURIComponent(id)}`,
      { body: patch },
    );
  }

  deleteFolder(id: string): Promise<void> {
    return this.request(
      "DELETE",
      `/documents/folders/${encodeURIComponent(id)}`,
    );
  }
}
