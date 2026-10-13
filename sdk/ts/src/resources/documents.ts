import type { RequestFn } from "../http/httpClient";
import type {
  Document,
  DocumentCreate,
  DocumentUpdate,
  DocumentUploadPolicy,
  Page,
} from "../types";

export interface DocumentListParams {
  q?: string;
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
    form.append("metadata", JSON.stringify(metadata));
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
}
