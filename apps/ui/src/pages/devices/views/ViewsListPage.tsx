import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceViews } from "@/hooks/useDeviceViews";
import { DevicesTabs } from "./DevicesTabs";
import { GroupError } from "@/components/group-command/GroupError";
import { useDevicesList } from "@/hooks/useDevicesList";
import {
  groupMembers,
  groupTagValue,
} from "@/components/group-command/groupMembership";

export default function ViewsListPage() {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const views = useDeviceViews();
  const members = useDevicesList();
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("groups.title")}
        caption={t("groups.caption")}
        actions={
          can("devices:write") && (
            <Button asChild>
              <Link to="/devices/views/new">{t("groups.create")}</Link>
            </Button>
          )
        }
      />
      <DevicesTabs />
      <GroupError error={views.error || members.error} />
      {views.isLoading ? (
        <p role="status">{t("presentation.loading")}</p>
      ) : !views.data?.length ? (
        <p className="rounded-lg border border-dashed p-8 text-muted-foreground">
          {t("groups.noGroups")}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {views.data.map((view) => {
            const value = groupTagValue(view);
            return (
              <Link
                className="space-y-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary"
                key={view.id}
                to={`/devices/views/${view.id}`}
              >
                <h2 className="font-semibold">{view.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {view.description}
                </p>
                <p className="text-sm text-muted-foreground">
                  {value !== null
                    ? members.loading || members.error
                      ? "…"
                      : t("groups.equipmentCount", {
                          count: groupMembers(members.devices, value).length,
                        })
                    : view.group_by.join(" → ") || t("views.title")}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
