import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceGroups } from "./useDeviceGroups";
import { DevicesTabs } from "./DevicesTabs";
import { GroupError } from "./GroupError";

export default function GroupsListPage() {
  const { t } = useTranslation("devices");
  const can = usePermissions();
  const { data: groups, isLoading, error } = useDeviceGroups();
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("devices.title")}
        caption={t("groups.caption")}
        actions={
          can("devices:write") && (
            <Button asChild>
              <Link to="/devices/groups/new">
                <Plus />
                {t("groups.create")}
              </Link>
            </Button>
          )
        }
      />
      <DevicesTabs />
      <GroupError error={error} />
      {isLoading ? (
        <p role="status">{t("presentation.loading")}</p>
      ) : groups?.length === 0 ? (
        <ResourceEmpty resourceName={t("groups.title").toLowerCase()} />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                {[
                  t("groups.name"),
                  t("groups.driver"),
                  t("groups.members"),
                ].map((label) => (
                  <th key={label} className="p-4 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {groups?.map((group) => (
                <tr key={group.id} className="hover:bg-muted/30">
                  <td className="p-4">
                    <Link
                      className="font-medium hover:underline"
                      to={`/devices/groups/${group.id}`}
                    >
                      {group.name}
                    </Link>
                    <p className="text-muted-foreground">{group.description}</p>
                  </td>
                  <td className="p-4">{group.driver_id}</td>
                  <td className="p-4 tabular-nums">
                    {group.device_ids?.length ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
