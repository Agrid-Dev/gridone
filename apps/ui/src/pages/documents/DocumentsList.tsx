import { useTranslation } from "react-i18next";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { FileText, Download, Plus } from "lucide-react";
import type { DocumentListParams } from "@gridone/sdk";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/contexts/AuthContext";
import {
  documentSize,
  useDocumentActions,
  useDocumentChoices,
  useDocumentFilters,
  useDocuments,
} from "./useDocuments";

export function DocumentRows({
  params,
  onPage,
  clear,
}: {
  params: DocumentListParams;
  onPage?: (page: number) => void;
  clear?: () => void;
}) {
  const { t, i18n } = useTranslation("documents");
  const { data, isLoading } = useDocuments(params);
  const { download } = useDocumentActions();
  if (isLoading || !data) return <Skeleton className="h-32" />;
  if (!data.items.length)
    return (
      <ResourceEmpty
        resourceName={t("title")}
        title={t("empty")}
        description={t("emptyHint")}
        filtered={
          !!clear &&
          !!(
            params.q ||
            params.asset_id ||
            params.device_id ||
            (params.page ?? 1) > 1
          )
        }
        onClearFilters={clear}
      />
    );
  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {data.items.map((document) => (
          <li key={document.id} className="flex items-center gap-3 p-4">
            <FileText
              className="h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <Link
                className="block break-words font-medium hover:underline"
                to={`/documents/${encodeURIComponent(document.id)}`}
              >
                {document.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {document.filename.split(".").at(-1)?.toUpperCase()} ·{" "}
                {documentSize(document.size, i18n.language)} ·{" "}
                {new Date(document.created_at).toLocaleDateString(
                  i18n.language,
                )}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("downloadNamed", { name: document.name })}
              disabled={download.isPending}
              onClick={() => download.mutate(document)}
            >
              <Download className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {onPage && data.total_pages > 1 && (
        <nav
          aria-label={t("pagination")}
          className="flex items-center justify-end gap-3"
        >
          <Button
            variant="outline"
            disabled={data.page <= 1}
            onClick={() => onPage(data.page - 1)}
          >
            {t("previous")}
          </Button>
          <span className="text-sm">
            {t("page", { current: data.page, total: data.total_pages })}
          </span>
          <Button
            variant="outline"
            disabled={data.page >= data.total_pages}
            onClick={() => onPage(data.page + 1)}
          >
            {t("next")}
          </Button>
        </nav>
      )}
    </div>
  );
}

export default function DocumentsList() {
  const { t } = useTranslation("documents");
  const can = usePermissions();
  const { params, setFilter, clear } = useDocumentFilters();
  const choices = useDocumentChoices();
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("caption")}
        actions={
          can("documents:write") && (
            <Button asChild>
              <Link to="/documents/new">
                <Plus />
                {t("add")}
              </Link>
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          aria-label={t("search")}
          placeholder={t("search")}
          value={params.q ?? ""}
          onChange={(event) => setFilter("q", event.target.value)}
        />
        {(["asset_id", "device_id"] as const).map((key) => (
          <select
            key={key}
            aria-label={t(key === "asset_id" ? "assets" : "devices")}
            className="h-11 rounded-md border bg-background px-3 text-sm"
            value={params[key] ?? ""}
            onChange={(event) => setFilter(key, event.target.value)}
          >
            <option value="">
              {t(key === "asset_id" ? "allAssets" : "allDevices")}
            </option>
            {(key === "asset_id" ? choices.assets : choices.devices).map(
              (item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ),
            )}
          </select>
        ))}
      </div>
      <DocumentRows
        params={params}
        onPage={(page) => setFilter("page", String(page))}
        clear={clear}
      />
    </section>
  );
}
