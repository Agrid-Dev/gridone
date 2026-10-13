import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
} from "lucide-react";
import type { Document, DocumentListParams } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Th,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { documentSize, useDocumentActions, useDocuments } from "./useDocuments";

function DocumentIcon({ document }: { document: Document }) {
  const isSpreadsheet =
    document.media_type === "text/csv" ||
    document.media_type.includes("spreadsheetml");
  const Icon = isSpreadsheet
    ? FileSpreadsheet
    : document.media_type.startsWith("image/")
      ? FileImage
      : FileText;

  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
        isSpreadsheet
          ? "bg-success/10 text-[hsl(var(--success))]"
          : "bg-primary/10 text-primary",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
}

function DocumentName({
  document,
  compact,
}: {
  document: Document;
  compact: boolean;
}) {
  const { i18n } = useTranslation("documents");
  return (
    <div className="flex min-w-0 items-center gap-3">
      <DocumentIcon document={document} />
      <div className="min-w-0">
        <Link
          to={`/documents/${encodeURIComponent(document.id)}`}
          className="block truncate font-medium text-primary hover:underline focus-visible:underline"
          title={document.name}
        >
          {document.name}
        </Link>
        {!compact && document.name !== document.filename && (
          <p
            className="hidden truncate text-xs text-muted-foreground md:block"
            title={document.filename}
          >
            {document.filename}
          </p>
        )}
        <p
          className={cn(
            "mt-0.5 text-xs text-muted-foreground",
            !compact && "md:hidden",
          )}
        >
          {document.filename.split(".").at(-1)?.toUpperCase()} ·{" "}
          {documentSize(document.size, i18n.language)} ·{" "}
          {new Date(document.created_at).toLocaleDateString(i18n.language)}
        </p>
      </div>
    </div>
  );
}

export function DocumentRows({
  params,
  onPage,
  clear,
  compact = false,
}: {
  params: DocumentListParams;
  onPage?: (page: number) => void;
  clear?: () => void;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation("documents");
  const { data, isLoading } = useDocuments(params);
  const { download } = useDocumentActions();
  if (isLoading || !data)
    return (
      <div role="status" aria-label={t("loading")} className="space-y-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-16" />
      </div>
    );
  if (!data.items.length)
    return (
      <ResourceEmpty
        className="rounded-lg border bg-card"
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
        clearLabel={t("clearFilters")}
        onClearFilters={clear}
      />
    );

  const downloadButton = (document: Document) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-primary"
      aria-label={t("downloadNamed", { name: document.name })}
      title={t("download")}
      disabled={download.isPending}
      onClick={() => download.mutate(document)}
    >
      {download.isPending && download.variables?.id === document.id ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Download className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );

  if (compact)
    return (
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {data.items.map((document) => (
          <li key={document.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <DocumentName document={document} compact />
            </div>
            {downloadButton(document)}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <Table className="table-fixed" aria-label={t("title")}>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <Th>{t("name")}</Th>
            <Th className="hidden w-24 md:table-cell">{t("format")}</Th>
            <Th className="hidden w-28 text-right md:table-cell">
              {t("size")}
            </Th>
            <Th className="hidden w-36 md:table-cell">{t("createdAt")}</Th>
            <Th className="w-16">
              <span className="sr-only">{t("download")}</span>
            </Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((document) => (
            <TableRow key={document.id}>
              <TableCell className="py-3">
                <DocumentName document={document} compact={false} />
              </TableCell>
              <TableCell className="hidden py-3 md:table-cell">
                <Badge
                  variant="secondary"
                  className="rounded-md text-[11px] font-medium"
                >
                  {document.filename.split(".").at(-1)?.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="hidden py-3 text-right tabular-nums text-muted-foreground md:table-cell">
                {documentSize(document.size, i18n.language)}
              </TableCell>
              <TableCell className="hidden py-3 tabular-nums text-muted-foreground md:table-cell">
                <time dateTime={document.created_at}>
                  {new Date(document.created_at).toLocaleDateString(
                    i18n.language,
                  )}
                </time>
              </TableCell>
              <TableCell className="py-3 text-right">
                {downloadButton(document)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground" role="status">
          {t("count", { count: data.total })}
        </p>
        {onPage && data.total_pages > 1 && (
          <nav aria-label={t("pagination")} className="flex items-center gap-2">
            <span className="mr-2 text-xs text-muted-foreground">
              {t("page", { current: data.page, total: data.total_pages })}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label={t("previous")}
              disabled={data.page <= 1}
              onClick={() => onPage(data.page - 1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label={t("next")}
              disabled={data.page >= data.total_pages}
              onClick={() => onPage(data.page + 1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}
