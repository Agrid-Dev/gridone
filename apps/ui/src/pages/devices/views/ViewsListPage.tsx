import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { usePermissions } from "@/contexts/AuthContext";
import { DeviceViewCards } from "@/components/group-command/DeviceViewCards";
import { DevicesTabs } from "./DevicesTabs";

/** Groups to consult and command. Creating and editing them is configuration. */
export default function ViewsListPage() {
  const { t } = useTranslation(["devices", "common"]);
  const can = usePermissions();
  return (
    <section className="space-y-4">
      <ResourceHeader
        flush
        title={t("groups.title")}
        caption={t("groups.caption")}
        actions={
          can("devices:write") && (
            <Button asChild variant="outline">
              <Link to="/groups">{t("groups.manage")}</Link>
            </Button>
          )
        }
      />
      <DevicesTabs />
      <DeviceViewCards
        hrefOf={(view) => `/devices/views/${view.id}`}
        empty={
          <ResourceEmpty
            resourceName={t("groups.title").toLowerCase()}
            title={t("groups.noGroups")}
          />
        }
      />
      {can("devices:write") && (
        <p className="text-sm text-muted-foreground">
          {t("groups.manageHint")}{" "}
          <Link className="underline" to="/groups">
            {t("groups.manage")}
          </Link>
        </p>
      )}
    </section>
  );
}
