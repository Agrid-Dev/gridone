import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DeviceViewCards } from "@/components/group-command/DeviceViewCards";

/** Configuration › Groups: where groups are created and edited. */
export default function GroupsListPage() {
  const { t } = useTranslation(["devices", "common"]);
  return (
    <section className="space-y-4">
      <ResourceHeader
        title={t("groups.title")}
        caption={t("groups.configurationCaption")}
        actions={
          <Button asChild>
            <Link to="/groups/new">{t("groups.create")}</Link>
          </Button>
        }
      />
      <DeviceViewCards
        hrefOf={(view) => `/groups/${view.id}/edit`}
        empty={
          <ResourceEmpty
            resourceName={t("groups.title").toLowerCase()}
            showCreate
            title={t("groups.noGroups")}
            createTo="/groups/new"
            createLabel={t("common:empty.create.views")}
          />
        }
      />
    </section>
  );
}
