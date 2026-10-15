import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Archive } from "lucide-react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePermissions } from "@/contexts/AuthContext";
import { markResourceDeleted } from "@/lib/navigation";
import { folderPath, hidingFolder, indexFolders } from "./folderTree";
import {
  documentSize,
  folderLink,
  useDocumentActions,
  useDocumentChoices,
  useDocumentFolders,
  useDocumentFromRoute,
  viewableType,
} from "./useDocuments";

export default function DocumentDetail() {
  const { t, i18n } = useTranslation("documents");
  const document = useDocumentFromRoute();
  const { download, remove, open, view, archive } = useDocumentActions();
  const choices = useDocumentChoices();
  const folders = useDocumentFolders();
  const can = usePermissions();
  const navigate = useNavigate();
  const index = indexFolders(folders.data ?? []);
  const path = folderPath(document.folder_id, index);
  const hiddenBy = hidingFolder(document.folder_id, index);
  const viewable = !!viewableType(document);
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={document.name}
        caption={document.filename}
        actions={
          <>
            {viewable && (
              <Button onClick={() => open(document)} disabled={view.isPending}>
                {t("open")}
              </Button>
            )}
            <Button
              variant={viewable ? "outline" : "default"}
              onClick={() => download.mutate(document)}
              disabled={download.isPending}
            >
              {t("download")}
            </Button>
            {can("documents:write") && (
              <>
                <Button asChild variant="outline">
                  <Link to="edit">{t("edit")}</Link>
                </Button>
                <Button
                  variant="outline"
                  disabled={archive.isPending}
                  onClick={() =>
                    archive.mutate({
                      item: document,
                      archived: !document.archived_at,
                    })
                  }
                >
                  {t(document.archived_at ? "restore" : "archive")}
                </Button>
                <ConfirmButton
                  variant="destructive"
                  confirmTitle={t("deleteTitle")}
                  confirmDetails={t("deleteHint")}
                  onConfirm={async () => {
                    await remove.mutateAsync(document.id);
                    markResourceDeleted(`/documents/${document.id}`);
                    navigate("/documents");
                  }}
                >
                  {t("delete")}
                </ConfirmButton>
              </>
            )}
          </>
        }
      />
      {document.archived_at && (
        <Alert>
          <Archive className="h-4 w-4" aria-hidden />
          <AlertTitle>
            {t("archivedOn", {
              date: new Date(document.archived_at).toLocaleDateString(
                i18n.language,
              ),
            })}
          </AlertTitle>
          <AlertDescription>{t("archivedDocumentHint")}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="space-y-6 pt-6">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground">{t("folder")}</dt>
              <dd>
                {path.length ? (
                  <>
                    <Link
                      className="text-primary hover:underline"
                      to={folderLink(path.at(-1)!.id)}
                    >
                      {path.map((folder) => folder.name).join(" › ")}
                    </Link>
                    {hiddenBy && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {t("hiddenBy", { name: hiddenBy.name })}
                      </span>
                    )}
                  </>
                ) : document.folder_id ? (
                  <span className="text-muted-foreground">
                    {folders.isLoading ? t("loading") : t("unavailable")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t("noFolder")}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t("size")}</dt>
              <dd>{documentSize(document.size, i18n.language)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                {t("createdAt")}
              </dt>
              <dd>
                {new Date(document.created_at).toLocaleString(i18n.language)}
              </dd>
            </div>
          </dl>
          {(["asset_ids", "device_ids"] as const).map((key) => (
            <div key={key}>
              <h3 className="mb-2 font-medium">
                {t(key === "asset_ids" ? "assets" : "devices")}
              </h3>
              {document[key]?.length ? (
                <ul className="space-y-1">
                  {document[key].map((id) => {
                    const item = (
                      key === "asset_ids" ? choices.assets : choices.devices
                    ).find((choice) => choice.id === id);
                    return (
                      <li key={id}>
                        {item ? (
                          <Link
                            className="text-primary hover:underline"
                            to={`/${key === "asset_ids" ? "assets" : "devices"}/${encodeURIComponent(id)}`}
                          >
                            {item.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            {choices.loading ? t("loading") : t("unavailable")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noLinks")}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
