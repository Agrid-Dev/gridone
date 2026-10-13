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
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import { downloadBlob } from "@/lib/download";
import { serverErrorMessage } from "@/lib/serverErrorMessage";

export const documentsKey = ["documents"] as const;

export function useDocuments(params: DocumentListParams) {
  const client = useGridoneClient();
  return useQuery({
    queryKey: [...documentsKey, "list", params],
    queryFn: () => client.documents.list(params),
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
    queryFn: () => client.devices.list(),
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
  return { create, update, remove, download };
}

export function useDocumentFilters() {
  const [search, setSearch] = useSearchParams();
  const rawPage = Number(search.get("page"));
  const params: DocumentListParams = {
    q: search.get("q") || undefined,
    asset_id: search.get("asset_id") || undefined,
    device_id: search.get("device_id") || undefined,
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
  function setFilter(
    key: "q" | "asset_id" | "device_id" | "page",
    value: string,
  ) {
    setSearch(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== "page") next.delete("page");
        return next;
      },
      { replace: true },
    );
  }
  return { params, setFilter, clear: () => setSearch({}) };
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
