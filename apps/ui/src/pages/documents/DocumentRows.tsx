import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder as FolderIcon,
} from "lucide-react";
import type { PointerEvent } from "react";
import type { Document, DocumentListParams, Folder } from "@gridone/sdk";
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
import { DocumentRowActions, FolderRowActions } from "./DocumentActions";
import { useDocumentDrag, useFolderDrop } from "./documentDrag";
import { folderPath, type FolderIndex } from "./folderTree";
import {
  documentSize,
  folderLink,
  useDocumentActions,
  useDocuments,
  useFolderActions,
} from "./useDocuments";

type DocumentActionsApi = ReturnType<typeof useDocumentActions>;

/** Presses on a row's buttons and menus are clicks, never the start of a drag. */
const keepClicks = (event: PointerEvent) => event.stopPropagation();

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

/** Where an item is filed, under its name in search results and archives. */
function FolderCaption({ path }: { path: readonly Folder[] }) {
  const { t } = useTranslation("documents");
  if (!path.length) return null;
  const folder = path.at(-1)!;
  return (
    <p className="truncate text-xs text-muted-foreground">
      {t("inFolder")}{" "}
      <Link to={folderLink(folder.id)} className="hover:underline">
        {path.map((f) => f.name).join(" › ")}
      </Link>
    </p>
  );
}

function DocumentName({
  document,
  compact,
  path,
}: {
  document: Document;
  compact: boolean;
  path?: readonly Folder[];
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
        {path && <FolderCaption path={path} />}
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

function FolderRow({
  folder,
  index,
  showPath,
  droppable,
  actions,
  onRename,
  onDelete,
}: {
  folder: Folder;
  index: FolderIndex;
  showPath: boolean;
  droppable: boolean;
  actions: ReturnType<typeof useFolderActions>;
  onRename?: (folder: Folder) => void;
  onDelete?: (folder: Folder) => void;
}) {
  const { t, i18n } = useTranslation("documents");
  const drop = useFolderDrop(folder, !droppable);
  return (
    <TableRow
      ref={drop.ref}
      className={cn(drop.isOver && "bg-primary/10 hover:bg-primary/10")}
    >
      <TableCell className="py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FolderIcon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <Link
              to={folderLink(folder.id)}
              className="block truncate font-medium text-primary hover:underline focus-visible:underline"
              title={folder.name}
            >
              {folder.name}
            </Link>
            {showPath && (
              <FolderCaption path={folderPath(folder.parent_id, index)} />
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden py-3 text-xs text-muted-foreground md:table-cell">
        {t("folder")}
      </TableCell>
      <TableCell className="hidden md:table-cell" />
      <TableCell className="hidden py-3 tabular-nums text-muted-foreground md:table-cell">
        <time dateTime={folder.created_at}>
          {new Date(folder.created_at).toLocaleDateString(i18n.language)}
        </time>
      </TableCell>
      <TableCell className="py-3 text-right" onPointerDown={keepClicks}>
        {onRename && onDelete && (
          <FolderRowActions
            folder={folder}
            actions={actions}
            onRename={onRename}
            onDelete={onDelete}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

function DocumentRow({
  document,
  index,
  showPath,
  draggable,
  actions,
  onDelete,
}: {
  document: Document;
  index: FolderIndex;
  showPath: boolean;
  draggable: boolean;
  actions: DocumentActionsApi;
  onDelete?: (document: Document) => void;
}) {
  const { i18n } = useTranslation("documents");
  const drag = useDocumentDrag(document, !draggable);
  return (
    <TableRow
      ref={drag.ref}
      {...drag.listeners}
      className={cn(
        draggable && "cursor-grab",
        drag.isDragging && "opacity-50",
      )}
    >
      <TableCell className="py-3">
        <DocumentName
          document={document}
          compact={false}
          path={showPath ? folderPath(document.folder_id, index) : undefined}
        />
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
          {new Date(document.created_at).toLocaleDateString(i18n.language)}
        </time>
      </TableCell>
      <TableCell className="py-3 text-right" onPointerDown={keepClicks}>
        <DocumentRowActions
          document={document}
          actions={actions}
          onDelete={onDelete}
        />
      </TableCell>
    </TableRow>
  );
}

export interface DocumentRowsProps {
  params: DocumentListParams;
  compact?: boolean;
  /** Folder rows listed above the documents, on the first page. */
  folders?: readonly Folder[];
  /** Every folder, to name where an item is filed. */
  index?: FolderIndex;
  /** Show each item's folder under its name (search results, archives). */
  showPaths?: boolean;
  /** Documents can be dragged onto folder rows (and the breadcrumb). */
  draggable?: boolean;
  empty?: { title: string; description: string };
  onPage?: (page: number) => void;
  clear?: () => void;
  onRenameFolder?: (folder: Folder) => void;
  onDeleteFolder?: (folder: Folder) => void;
  onDeleteDocument?: (document: Document) => void;
}

export function DocumentRows({
  params,
  compact = false,
  folders = [],
  index = new Map(),
  showPaths = false,
  draggable = false,
  empty,
  onPage,
  clear,
  onRenameFolder,
  onDeleteFolder,
  onDeleteDocument,
}: DocumentRowsProps) {
  const { t } = useTranslation("documents");
  const { data, isLoading } = useDocuments(params);
  const actions = useDocumentActions();
  const folderActions = useFolderActions();
  if (isLoading || !data)
    return (
      <div role="status" aria-label={t("loading")} className="space-y-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-16" />
      </div>
    );
  const shownFolders = data.page <= 1 ? folders : [];
  if (!data.items.length && !shownFolders.length)
    return (
      <ResourceEmpty
        className="rounded-lg border bg-card"
        resourceName={t("title")}
        title={empty?.title ?? t("empty")}
        description={empty?.description ?? t("emptyHint")}
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

  if (compact)
    return (
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {data.items.map((document) => (
          <li key={document.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <DocumentName document={document} compact />
            </div>
            <DocumentRowActions document={document} actions={actions} />
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
            <Th className="w-36">
              <span className="sr-only">{t("actions")}</span>
            </Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shownFolders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              index={index}
              showPath={showPaths}
              droppable={draggable}
              actions={folderActions}
              onRename={onRenameFolder}
              onDelete={onDeleteFolder}
            />
          ))}
          {data.items.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              index={index}
              showPath={showPaths}
              draggable={draggable}
              actions={actions}
              onDelete={onDeleteDocument}
            />
          ))}
        </TableBody>
      </Table>
      {/* A folder holding only subfolders has no document count to show. */}
      {data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground" role="status">
            {t("count", { count: data.total })}
          </p>
          {onPage && data.total_pages > 1 && (
            <nav
              aria-label={t("pagination")}
              className="flex items-center gap-2"
            >
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
      )}
    </div>
  );
}
