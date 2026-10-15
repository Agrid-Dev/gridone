import { useTranslation } from "react-i18next";
import {
  Archive,
  ArchiveRestore,
  Download,
  Ellipsis,
  Eye,
  Loader2,
  PencilLine,
  Trash2,
} from "lucide-react";
import type { Document, Folder } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/contexts/AuthContext";
import {
  useDocumentActions,
  useFolderActions,
  viewableType,
} from "./useDocuments";

const iconButton = "h-9 w-9 shrink-0 text-muted-foreground hover:text-primary";

function ActionsTrigger({ name }: { name: string }) {
  const { t } = useTranslation("documents");
  return (
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className={iconButton}
        aria-label={t("actionsNamed", { name })}
      >
        <Ellipsis className="h-4 w-4" aria-hidden />
      </Button>
    </DropdownMenuTrigger>
  );
}

/** Open and download stay one click away; changes go in the menu, shown to
 *  writers when the row can open the delete confirmation. */
export function DocumentRowActions({
  document,
  actions,
  onDelete,
}: {
  document: Document;
  actions: ReturnType<typeof useDocumentActions>;
  onDelete?: (document: Document) => void;
}) {
  const { t } = useTranslation("documents");
  const can = usePermissions();
  const { view, download, archive, open } = actions;
  const viewing = view.isPending && view.variables?.document.id === document.id;
  const downloading =
    download.isPending && download.variables?.id === document.id;
  return (
    <div className="flex items-center justify-end gap-1">
      {viewableType(document) && (
        <Button
          variant="ghost"
          size="icon"
          className={iconButton}
          aria-label={t("openNamed", { name: document.name })}
          title={t("open")}
          disabled={viewing}
          onClick={() => open(document)}
        >
          {viewing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={iconButton}
        aria-label={t("downloadNamed", { name: document.name })}
        title={t("download")}
        disabled={downloading}
        onClick={() => download.mutate(document)}
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
      </Button>
      {onDelete && can("documents:write") && (
        <DropdownMenu>
          <ActionsTrigger name={document.name} />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to={`/documents/${encodeURIComponent(document.id)}/edit`}>
                <PencilLine />
                {t("editAction")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                archive.mutate({
                  item: document,
                  archived: !document.archived_at,
                })
              }
            >
              {document.archived_at ? <ArchiveRestore /> : <Archive />}
              {t(document.archived_at ? "restore" : "archive")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete(document)}
            >
              <Trash2 />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function FolderRowActions({
  folder,
  actions,
  onRename,
  onDelete,
}: {
  folder: Folder;
  actions: ReturnType<typeof useFolderActions>;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}) {
  const { t } = useTranslation("documents");
  const can = usePermissions();
  if (!can("documents:write")) return null;
  return (
    <DropdownMenu>
      <ActionsTrigger name={folder.name} />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => onRename(folder)}>
          <PencilLine />
          {t("rename")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            actions.archive.mutate({
              item: folder,
              archived: !folder.archived_at,
            })
          }
        >
          {folder.archived_at ? <ArchiveRestore /> : <Archive />}
          {t(folder.archived_at ? "restore" : "archive")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDelete(folder)}
        >
          <Trash2 />
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
