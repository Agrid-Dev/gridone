import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, FolderPlus, Plus, Search, X } from "lucide-react";
import { isGridoneError, type Document, type Folder } from "@gridone/sdk";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/contexts/AuthContext";
import { markResourceDeleted } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { DocumentRows } from "./DocumentRows";
import { DocumentsBreadcrumb } from "./DocumentsBreadcrumb";
import { DocumentsDrag } from "./documentDrag";
import { FolderDialog } from "./FolderDialog";
import {
  useDocumentActions,
  useDocumentChoices,
  useDocumentsBrowser,
  useFolderActions,
} from "./useDocuments";

type DocumentsDialog =
  | { mode: "create-folder" }
  | { mode: "rename-folder"; folder: Folder }
  | { mode: "delete-folder"; folder: Folder }
  | { mode: "delete-document"; document: Document };

export default function DocumentsList() {
  const { t } = useTranslation("documents");
  const can = usePermissions();
  const browser = useDocumentsBrowser();
  const { params, filters, folderId, view, setFilter, clear } = browser;
  const choices = useDocumentChoices();
  const actions = useDocumentActions();
  const folderActions = useFolderActions();
  const [dialog, setDialog] = useState<DocumentsDialog | null>(null);
  const close = () => setDialog(null);
  const hasFilters = !!(filters.q || filters.asset_id || filters.device_id);
  if (browser.missingFolder) return <NotFoundFallback />;

  const empty =
    view === "archives"
      ? { title: t("emptyArchives"), description: t("emptyArchivesHint") }
      : view === "browse" && folderId
        ? {
            title: t("emptyFolder"),
            description: t(browser.canFile ? "emptyFolderHint" : "emptyHint"),
          }
        : undefined;
  const folderDialog =
    dialog?.mode === "create-folder" || dialog?.mode === "rename-folder"
      ? dialog
      : null;
  const deleting =
    dialog?.mode === "delete-folder" || dialog?.mode === "delete-document"
      ? dialog
      : null;

  // In a folder, the title names it and its parents lead up to it.
  const current = view === "browse" ? browser.path.at(-1) : undefined;

  return (
    <DocumentsDrag onMove={(move) => actions.move.mutate(move)}>
      <section className="space-y-6">
        <ResourceHeader
          breadcrumb={
            current && (
              <DocumentsBreadcrumb
                ancestors={browser.path.slice(0, -1)}
                droppable={browser.canFile}
              />
            )
          }
          title={current?.name ?? t("title")}
          caption={current ? undefined : t("caption")}
          actions={
            can("documents:write") && (
              <>
                {browser.canFile && (
                  <Button
                    variant="outline"
                    onClick={() => setDialog({ mode: "create-folder" })}
                  >
                    <FolderPlus />
                    {t("newFolder")}
                  </Button>
                )}
                <Button asChild>
                  <Link
                    to={
                      browser.canFile && folderId
                        ? `/documents/new?folder=${encodeURIComponent(folderId)}`
                        : "/documents/new"
                    }
                  >
                    <Plus />
                    {t("add")}
                  </Link>
                </Button>
              </>
            )
          }
        />
        <Tabs
          value={view === "archives" ? "archives" : "documents"}
          onValueChange={(value) => browser.showArchives(value === "archives")}
        >
          <TabsList>
            <TabsTrigger value="documents">{t("title")}</TabsTrigger>
            <TabsTrigger value="archives">{t("archives")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="space-y-4">
          {browser.hiddenBy && (
            <Alert>
              <Archive className="h-4 w-4" aria-hidden />
              <AlertTitle>{t("archivedFolderTitle")}</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {t(
                    browser.hiddenBy.id === folderId
                      ? "archivedFolderHint"
                      : "insideArchivedFolderHint",
                    { name: browser.hiddenBy.name },
                  )}
                </span>
                {can("documents:write") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={folderActions.archive.isPending}
                    onClick={() =>
                      folderActions.archive.mutate({
                        item: browser.hiddenBy!,
                        archived: false,
                      })
                    }
                  >
                    {t("restoreNamed", { name: browser.hiddenBy.name })}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-80">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              />
              <Input
                type="search"
                className="h-9 pl-9"
                aria-label={t("search")}
                placeholder={t("search")}
                value={filters.q ?? ""}
                onChange={(event) => setFilter("q", event.target.value)}
              />
            </div>
            {(["asset_id", "device_id"] as const).map((key) => (
              <Select
                key={key}
                value={filters[key] ?? "all"}
                onValueChange={(value) =>
                  setFilter(key, value === "all" ? "" : value)
                }
              >
                <SelectTrigger
                  aria-label={t(key === "asset_id" ? "assets" : "devices")}
                  className={cn(
                    "h-9 w-full sm:w-48",
                    filters[key] && "border-primary text-primary",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t(key === "asset_id" ? "allAssets" : "allDevices")}
                  </SelectItem>
                  {(key === "asset_id" ? choices.assets : choices.devices).map(
                    (item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            ))}
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clear}>
                <X aria-hidden />
                {t("clearFilters")}
              </Button>
            )}
          </div>
          <DocumentRows
            params={params}
            folders={browser.folderRows}
            index={browser.index}
            showPaths={view !== "browse"}
            draggable={browser.canFile}
            empty={empty}
            onPage={(page) => setFilter("page", String(page))}
            clear={clear}
            onRenameFolder={(folder) =>
              setDialog({ mode: "rename-folder", folder })
            }
            onDeleteFolder={(folder) =>
              setDialog({ mode: "delete-folder", folder })
            }
            onDeleteDocument={(document) =>
              setDialog({ mode: "delete-document", document })
            }
          />
        </div>
        <FolderDialog
          open={folderDialog !== null}
          title={t(
            folderDialog?.mode === "rename-folder"
              ? "renameFolder"
              : "newFolder",
          )}
          submitLabel={t(
            folderDialog?.mode === "rename-folder" ? "save" : "createFolder",
          )}
          defaultName={
            folderDialog?.mode === "rename-folder"
              ? folderDialog.folder.name
              : ""
          }
          onSubmit={(name) =>
            folderDialog?.mode === "rename-folder"
              ? folderActions.update.mutateAsync({
                  id: folderDialog.folder.id,
                  patch: { name },
                })
              : folderActions.create.mutateAsync({ name, parent_id: folderId })
          }
          onClose={close}
        />
        <ConfirmationDialog
          open={deleting !== null}
          onOpenChange={(open) => !open && close()}
          title={
            deleting?.mode === "delete-folder"
              ? t("deleteFolderTitle", { name: deleting.folder.name })
              : t("deleteTitle")
          }
          details={t(
            deleting?.mode === "delete-folder"
              ? "deleteFolderHint"
              : "deleteHint",
          )}
          label={t("delete")}
          describeError={(error) =>
            deleting?.mode === "delete-folder" &&
            isGridoneError(error) &&
            error.status === 409
              ? t("folderNotEmpty")
              : undefined
          }
          onConfirm={async () => {
            if (deleting?.mode === "delete-folder")
              await folderActions.remove.mutateAsync(deleting.folder.id);
            else if (deleting?.mode === "delete-document") {
              await actions.remove.mutateAsync(deleting.document.id);
              markResourceDeleted(`/documents/${deleting.document.id}`);
            }
          }}
        />
      </section>
    </DocumentsDrag>
  );
}
