import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePermissions } from "@/contexts/AuthContext";
import { markResourceDeleted } from "@/lib/navigation";
import {
  documentSize,
  useDocumentActions,
  useDocumentChoices,
  useDocumentFromRoute,
} from "./useDocuments";

export default function DocumentDetail() {
  const { t, i18n } = useTranslation("documents");
  const document = useDocumentFromRoute();
  const { download, remove } = useDocumentActions();
  const choices = useDocumentChoices();
  const can = usePermissions();
  const navigate = useNavigate();
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={document.name}
        caption={document.filename}
        actions={
          <>
            <Button
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
      <Card>
        <CardContent className="space-y-6 pt-6">
          <dl className="grid gap-3 sm:grid-cols-2">
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
          {can("documents:write") && (
            <div>
              <h3 className="mb-2 font-medium">{t("visibility")}</h3>
              <p className="text-sm">
                {document.allowed_role_ids.length
                  ? document.allowed_role_ids
                      .map(
                        (id) =>
                          choices.roles.find((r) => r.id === id)?.name ?? id,
                      )
                      .join(", ")
                  : t("adminOnly")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("adminAccess")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
